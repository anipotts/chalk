#!/usr/bin/env python3
"""Whisper transcription service — faster-whisper on GPU."""
import os, sys, glob, shutil, tempfile, subprocess
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import uvicorn

app = FastAPI()
_model = None


def get_model():
    global _model
    if _model is None:
        from faster_whisper import WhisperModel
        print("[whisperx] Loading model on GPU...")
        _model = WhisperModel("large-v3", device="cuda", compute_type="float16")
        print("[whisperx] Model ready.")
    return _model


class TranscribeRequest(BaseModel):
    video_id: str


@app.post("/transcribe")
async def transcribe(req: TranscribeRequest):
    vid = req.video_id
    if not vid or len(vid) != 11:
        raise HTTPException(400, "Invalid video_id")

    # Use a temp directory so yt-dlp can choose its own filename/extension
    tmpdir = tempfile.mkdtemp(dir="/tmp", prefix="whisperx-")
    try:
        # Download audio via yt-dlp
        outpath = os.path.join(tmpdir, "audio.%(ext)s")
        r = subprocess.run(
            [sys.executable, "-m", "yt_dlp",
             "-f", "bestaudio[ext=webm]/bestaudio",
             "--no-playlist", "--no-warnings",
             "-o", outpath,
             f"https://www.youtube.com/watch?v={vid}"],
            capture_output=True, text=True, timeout=120,
        )
        if r.returncode != 0:
            raise HTTPException(502, f"Audio download failed: {r.stderr[:300]}")

        # Find whatever file yt-dlp actually wrote
        files = glob.glob(os.path.join(tmpdir, "audio.*"))
        if not files:
            raise HTTPException(502, f"No audio file found. stdout: {r.stdout[:200]}")
        audio_path = files[0]
        fsize = os.path.getsize(audio_path)
        if fsize < 1000:
            raise HTTPException(502, f"Audio too small ({fsize} bytes)")
        print(f"[whisperx] {vid}: downloaded {fsize} bytes to {audio_path}")

        model = get_model()
        segs_gen, info = model.transcribe(
            audio_path, beam_size=5, word_timestamps=True, language="en",
        )

        segments = []
        for s in segs_gen:
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
            segments.append(seg)

        print(f"[whisperx] {vid}: {len(segments)} segments, {info.duration:.0f}s audio")
        return {"segments": segments, "duration": info.duration}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


@app.get("/health")
async def health():
    return {"status": "ok", "model": "large-v3"}


# Optional: register in Supabase service_registry on startup + heartbeat
async def register_service():
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print("[whisperx] No Supabase env vars — skipping service registration")
        return

    import json
    from urllib.request import Request, urlopen

    service_url = f"http://{os.uname().nodename}:8765"
    data = json.dumps({
        "service_name": "whisperx",
        "url": service_url,
        "updated_at": "now()",
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


@app.on_event("startup")
async def startup():
    get_model()  # warm up
    await register_service()


if __name__ == "__main__":
    get_model()  # warm up on startup
    uvicorn.run(app, host="0.0.0.0", port=8765)
