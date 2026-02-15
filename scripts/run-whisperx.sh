#!/bin/bash
# Auto-restart wrapper for whisperx-service.py on cuda5.
# Usage: nohup bash scripts/run-whisperx.sh &
cd "$(dirname "$0")/.."
source ~/whisperx-service/venv/bin/activate
while true; do
  echo "[$(date)] Starting WhisperX service..."
  python3 scripts/whisperx-service.py 2>&1 | tee -a /tmp/whisperx.log
  EXIT_CODE=$?
  echo "[$(date)] WhisperX exited with code $EXIT_CODE, restarting in 10s..."
  sleep 10
done
