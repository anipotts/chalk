#!/usr/bin/env python3
"""Whisper transcription service — faster-whisper on GPU.

Endpoints:
  POST /transcribe              — original sync endpoint (backward compat)
  POST /transcribe/progressive  — progressive: flushes segments to Supabase every 20 segs
  GET  /health                  — health check
  GET  /status                  — uptime, job count, GPU memory
"""
import os, sys, glob, shutil, tempfile, subprocess, time, json, asyncio, threading
from typing import Optional
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import uvicorn

app = FastAPI()
_model = None
_start_time = time.time()
_transcription_count = 0
_currently_processing: Optional[str] = None

# GPU concurrency guard — prevent simultaneous transcriptions (would OOM)
_gpu_lock = threading.Lock()

# Module-level Supabase credentials (read from env, never from HTTP requests)
_SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
_SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

# Max audio file size: 1.5 GB
_MAX_AUDIO_BYTES = 1_500_000_000


def get_model():
    global _model
    if _model is None:
        from faster_whisper import WhisperModel
        print("[whisperx] Loading model on GPU...")
        _model = WhisperModel("large-v3", device="cuda", compute_type="float16")
        print("[whisperx] Model ready.")
    return _model


def download_audio(vid: str, tmpdir: str, timeout: int = 600) -> str:
    """Download audio via yt-dlp with lower bitrate for long videos."""
    outpath = os.path.join(tmpdir, "audio.%(ext)s")
    r = subprocess.run(
        [sys.executable, "-m", "yt_dlp",
         "-f", "bestaudio[abr<=128][ext=webm]/bestaudio[abr<=128]/bestaudio",
         "--no-playlist", "--no-warnings",
         "-o", outpath,
         f"https://www.youtube.com/watch?v={vid}"],
        capture_output=True, text=True, timeout=timeout,
    )
    if r.returncode != 0:
        raise HTTPException(502, f"Audio download failed: {r.stderr[:300]}")

    files = glob.glob(os.path.join(tmpdir, "audio.*"))
    if not files:
        raise HTTPException(502, f"No audio file found. stdout: {r.stdout[:200]}")
    audio_path = files[0]
    fsize = os.path.getsize(audio_path)
    if fsize < 1000:
        raise HTTPException(502, f"Audio too small ({fsize} bytes)")
    if fsize > _MAX_AUDIO_BYTES:
        raise HTTPException(413, f"Audio too large ({fsize:,} bytes, max {_MAX_AUDIO_BYTES:,})")
    print(f"[whisperx] {vid}: downloaded {fsize:,} bytes to {audio_path}")
    return audio_path


def transcribe_audio(audio_path: str):
    """Run faster-whisper with VAD filtering for speed."""
    model = get_model()
    segs_gen, info = model.transcribe(
        audio_path, beam_size=5, word_timestamps=True, language="en",
        vad_filter=True,
        vad_parameters=dict(
            min_silence_duration_ms=500,
            speech_pad_ms=200,
            threshold=0.5,
        ),
    )
    return segs_gen, info


def seg_to_dict(s) -> dict:
    """Convert a faster-whisper segment to our JSON format."""
    seg = {
        "text": s.text.strip(),
        "offset": round(s.start, 3),
        "duration": round(s.end - s.start, 3),
    }
    if s.words:
        seg["words"] = [
            {"text": w.word.strip(), "startMs": int(w.start * 1000)}
            for w in s.words if w.word.strip()
        ]
    return seg


def supabase_upsert_segments(video_id: str, segments: list, source: str = "whisperx"):
    """Upsert accumulated segments to Supabase transcripts table via REST API."""
    if not _SUPABASE_URL or not _SUPABASE_KEY:
        raise RuntimeError("Supabase env vars not configured")
    from urllib.request import Request, urlopen

    last_seg = segments[-1] if segments else {}
    duration_seconds = last_seg.get("offset", 0) + last_seg.get("duration", 0)

    data = json.dumps({
        "video_id": video_id,
        "segments": segments,
        "source": source,
        "segment_count": len(segments),
        "duration_seconds": round(duration_seconds, 1),
        "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }).encode()

    req = Request(
        f"{_SUPABASE_URL}/rest/v1/transcripts",
        data=data,
        headers={
            "apikey": _SUPABASE_KEY,
            "Authorization": f"Bearer {_SUPABASE_KEY}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates",
        },
        method="POST",
    )
    urlopen(req, timeout=15)


def supabase_heartbeat(job_id: str, worker_id: str,
                        status: str = None, progress_pct: int = None,
                        segments_written: int = None):
    """Call heartbeat_job RPC via Supabase REST."""
    if not _SUPABASE_URL or not _SUPABASE_KEY:
        return
    from urllib.request import Request, urlopen

    params = {"p_job_id": job_id, "p_worker_id": worker_id}
    if status:
        params["p_status"] = status
    if progress_pct is not None:
        params["p_progress_pct"] = progress_pct
    if segments_written is not None:
        params["p_segments_written"] = segments_written

    data = json.dumps(params).encode()
    req = Request(
        f"{_SUPABASE_URL}/rest/v1/rpc/heartbeat_job",
        data=data,
        headers={
            "apikey": _SUPABASE_KEY,
            "Authorization": f"Bearer {_SUPABASE_KEY}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        urlopen(req, timeout=10)
    except Exception as e:
        print(f"[whisperx] heartbeat failed: {e}")


# ─── Original sync endpoint ─────────────────────────────────────────────────

class TranscribeRequest(BaseModel):
    video_id: str


@app.post("/transcribe")
def transcribe(req: TranscribeRequest):
    global _transcription_count, _currently_processing
    vid = req.video_id
    if not vid or len(vid) != 11:
        raise HTTPException(400, "Invalid video_id")

    if not _gpu_lock.acquire(blocking=False):
        raise HTTPException(503, "GPU busy with another transcription")

    _currently_processing = vid
    tmpdir = tempfile.mkdtemp(dir="/tmp", prefix="whisperx-")
    try:
        audio_path = download_audio(vid, tmpdir)
        segs_gen, info = transcribe_audio(audio_path)

        segments = []
        for s in segs_gen:
            segments.append(seg_to_dict(s))

        _transcription_count += 1
        print(f"[whisperx] {vid}: {len(segments)} segments, {info.duration:.0f}s audio")
        return {"segments": segments, "duration": info.duration}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))
    finally:
        _currently_processing = None
        _gpu_lock.release()
        shutil.rmtree(tmpdir, ignore_errors=True)


# ─── Progressive endpoint (flushes to Supabase) ─────────────────────────────

class ProgressiveRequest(BaseModel):
    video_id: str
    job_id: str
    worker_id: str


@app.post("/transcribe/progressive")
def transcribe_progressive(req: ProgressiveRequest):
    global _transcription_count, _currently_processing

    if not _SUPABASE_URL or not _SUPABASE_KEY:
        raise HTTPException(500, "Supabase env vars not configured on GPU server")

    vid = req.video_id
    if not vid or len(vid) != 11:
        raise HTTPException(400, "Invalid video_id")

    if not _gpu_lock.acquire(blocking=False):
        raise HTTPException(503, "GPU busy with another transcription")

    _currently_processing = vid
    tmpdir = tempfile.mkdtemp(dir="/tmp", prefix="whisperx-")
    flush_interval = 20  # flush every 20 segments

    try:
        # Download
        audio_path = download_audio(vid, tmpdir, timeout=600)

        # Heartbeat: downloading -> transcribing
        supabase_heartbeat(req.job_id, req.worker_id, status="transcribing")

        # Transcribe with progressive flushing
        segs_gen, info = transcribe_audio(audio_path)
        estimated_duration = info.duration or 600

        segments = []
        last_flush_count = 0

        for s in segs_gen:
            segments.append(seg_to_dict(s))

            # Flush every N segments
            if len(segments) - last_flush_count >= flush_interval:
                # Estimate progress based on last segment time vs total duration
                last_time = segments[-1].get("offset", 0)
                pct = min(95, int(last_time / estimated_duration * 100))

                try:
                    supabase_upsert_segments(vid, segments, "whisperx")
                    supabase_heartbeat(
                        req.job_id, req.worker_id,
                        progress_pct=pct, segments_written=len(segments)
                    )
                    last_flush_count = len(segments)
                    print(f"[whisperx] {vid}: flushed {len(segments)} segments ({pct}%)")
                except Exception as e:
                    print(f"[whisperx] {vid}: flush failed: {e}")

        # Final flush with all segments
        if segments:
            try:
                supabase_upsert_segments(vid, segments, "whisperx")
            except Exception as e:
                print(f"[whisperx] {vid}: final flush failed: {e}")

        _transcription_count += 1
        print(f"[whisperx] {vid}: progressive done — {len(segments)} segments, {info.duration:.0f}s audio")
        return {"segments": segments, "duration": info.duration, "segment_count": len(segments)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))
    finally:
        _currently_processing = None
        _gpu_lock.release()
        shutil.rmtree(tmpdir, ignore_errors=True)


# ─── Status + Health ─────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "model": "large-v3"}


@app.get("/status")
async def status():
    uptime = int(time.time() - _start_time)

    gpu_info = None
    try:
        r = subprocess.run(
            ["nvidia-smi", "--query-gpu=memory.used,memory.total", "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=5,
        )
        if r.returncode == 0:
            used, total = r.stdout.strip().split(", ")
            gpu_info = {"used_mb": int(used), "total_mb": int(total)}
    except Exception:
        pass

    return {
        "uptime_seconds": uptime,
        "transcription_count": _transcription_count,
        "currently_processing": _currently_processing,
        "gpu_memory": gpu_info,
    }


# ─── Service registration heartbeat ─────────────────────────────────────────

async def register_service():
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print("[whisperx] No Supabase env vars — skipping service registration")
        return

    from urllib.request import Request, urlopen

    service_url = f"http://{os.uname().nodename}:8765"
    data = json.dumps({
        "service_name": "whisperx",
        "url": service_url,
        "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }).encode()

    try:
        req = Request(
            f"{url}/rest/v1/service_registry",
            data=data,
            headers={
                "apikey": key,
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
                "Prefer": "resolution=merge-duplicates",
            },
            method="POST",
        )
        urlopen(req, timeout=5)
        print(f"[whisperx] Registered as '{service_url}' in service_registry")
    except Exception as e:
        print(f"[whisperx] Registration failed: {e}")


async def registration_heartbeat_loop():
    """Re-register every 30 minutes to prevent stale entries."""
    while True:
        await asyncio.sleep(30 * 60)
        await register_service()


def cleanup_orphan_temps():
    """Clean up old whisperx temp dirs on startup."""
    import pathlib
    cutoff = time.time() - 3600  # 1 hour old
    for p in pathlib.Path("/tmp").glob("whisperx-*"):
        try:
            if p.stat().st_mtime < cutoff:
                shutil.rmtree(p, ignore_errors=True)
                print(f"[whisperx] Cleaned orphan temp: {p}")
        except Exception:
            pass


@app.on_event("startup")
async def startup():
    cleanup_orphan_temps()
    get_model()  # warm up
    await register_service()
    asyncio.create_task(registration_heartbeat_loop())


if __name__ == "__main__":
    cleanup_orphan_temps()
    get_model()  # warm up on startup
    uvicorn.run(app, host="0.0.0.0", port=8765)
