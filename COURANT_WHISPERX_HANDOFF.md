# Courant WhisperX Transcription Service — Handoff Prompt

Copy everything below this line and paste it to a Claude Code agent in your MacBook terminal.

---

## Context

I'm building a hackathon project called **Chalk** — a Next.js YouTube Video Learning Assistant. It needs accurate transcripts with word-level timestamps for any YouTube video. The current transcript system has 13 code paths and is overly complex.

I have SSH access to NYU Courant's GPU compute servers. I want to deploy a **WhisperX transcription microservice** on one of these machines that my Vercel-hosted app can call.

## Courant GPU Servers Available

```
cuda2.cims.nyu.edu — 2x RTX 2080 Ti (11GB VRAM each), 40 cores, 256GB RAM, RHEL 9
cuda3.cims.nyu.edu — 2x TITAN V (12GB VRAM each), 48 cores, 128GB RAM, RHEL 9
cuda4.cims.nyu.edu — 2x GTX TITAN X (12GB VRAM each), 48 cores, 128GB RAM, RHEL 9
cuda5.cims.nyu.edu — 1x GTX 4070 (12GB VRAM), 16 cores, 64GB RAM, RHEL 9
```

To access: `ssh <netid>@access.cims.nyu.edu` then `ssh cuda2` (or whichever machine).
These machines are behind NYU's network — not directly reachable from the internet.

## What I Need You to Build

### 1. WhisperX FastAPI Service (`whisperx-service/`)

A Python FastAPI server that:
- Accepts a YouTube video ID via POST
- Downloads the audio using yt-dlp (should be installable via pip)
- Transcribes with WhisperX using `large-v2` model on GPU
- Returns JSON with word-level timestamps, segments, and optional speaker diarization
- Caches results locally (SQLite or filesystem) so the same video is never transcribed twice

**API contract:**
```
POST /transcribe
Body: { "video_id": "dQw4w9WgXcQ", "diarize": false }
Response: {
  "segments": [
    {
      "text": "We're no strangers to love",
      "offset": 18.2,
      "duration": 2.1,
      "speaker": "SPEAKER_00",  // only if diarize=true
      "words": [
        { "text": "We're", "startMs": 18200, "endMs": 18450 },
        { "text": "no", "startMs": 18450, "endMs": 18600 },
        ...
      ]
    },
    ...
  ],
  "language": "en",
  "duration_seconds": 212.0,
  "source": "whisperx-courant"
}

GET /health
Response: { "status": "ok", "gpu": "RTX 2080 Ti", "model": "large-v2" }

GET /cache/{video_id}
Response: cached result or 404
```

**Key requirements:**
- Use `faster-whisper` backend (WhisperX default)
- Use `large-v2` model (fits in 11GB with beam_size=5)
- Enable VAD preprocessing (reduces hallucination)
- Use `compute_type="float16"` for GPU
- Word-level timestamps via wav2vec2 alignment (this is WhisperX's killer feature)
- Handle videos of ANY length (no 25MB limit like cloud APIs)
- For long videos (>1hr), process in chunks if needed
- Auto-detect language (don't hardcode English)
- Return segments in the format above (compatible with Chalk's TranscriptSegment type)

### 2. Setup Script (`setup.sh`)

A bash script I can run on the Courant machine that:
- Checks CUDA availability
- Installs uv (Python package manager) if not present
- Creates a venv and installs WhisperX + FastAPI + uvicorn + yt-dlp
- Downloads the WhisperX large-v2 model and wav2vec2 alignment model
- Creates a systemd user service (or a tmux/screen launch script) to keep it running
- Sets up a simple auth token (env var `WHISPERX_API_KEY`) for security

### 3. Cloudflare Tunnel Setup (`tunnel-setup.sh`)

A script that:
- Downloads cloudflared binary for Linux amd64
- Sets up a quick tunnel: `cloudflared tunnel --url http://localhost:8000`
- Prints the public URL that Vercel can use
- Optionally sets up a named tunnel with a stable subdomain

### 4. Health Check & Monitoring (`monitor.sh`)

A script that:
- Checks if the FastAPI service is running
- Checks GPU utilization and memory
- Shows recent transcription logs
- Can restart the service if it crashed

## Project Structure

```
whisperx-service/
├── setup.sh              # One-time setup on Courant machine
├── tunnel-setup.sh       # Cloudflare tunnel for public access
├── monitor.sh            # Health check and restart
├── server.py             # FastAPI application
├── transcriber.py        # WhisperX transcription logic
├── cache.py              # Local SQLite cache for results
├── audio.py              # yt-dlp audio download logic
├── requirements.txt      # Python dependencies (or pyproject.toml)
└── README.md             # How to deploy and use
```

## Important Notes

- RHEL 9 uses `dnf` not `apt`
- I may not have sudo — use `--user` installs or virtual environments
- The Courant machines may already have CUDA installed (check with `nvidia-smi`)
- ffmpeg may or may not be installed — check and provide fallback install instructions
- The machines may have Python 3.9+ via `module load` or system python
- Keep the service lightweight — other students use these machines too
- Use batch_size=16 as default but make it configurable (lower if GPU OOM)
- The service should gracefully handle concurrent requests (queue them, don't crash)
- Speaker diarization requires a HuggingFace token for pyannote models — make this optional

## How Chalk Will Call This Service

The Chalk Next.js app (deployed on Vercel) will call this service as a fallback when YouTube captions aren't available. The endpoint URL will be stored as an environment variable `WHISPERX_SERVICE_URL` in Vercel.

The response format must match Chalk's `TranscriptSegment` type:
```typescript
interface TranscriptSegment {
  text: string;
  offset: number;      // seconds (float)
  duration: number;     // seconds (float)
  words?: Array<{
    text: string;
    startMs: number;    // milliseconds
  }>;
}
```

Please build all of this. Start with the Python service code, then the setup scripts.
