#!/bin/bash
# Auto-restart wrapper for queue-worker.ts on cuda5.
# Usage: nohup bash scripts/run-queue-worker.sh &
cd "$(dirname "$0")/.."
while true; do
  echo "[$(date)] Starting queue worker..."
  npx tsx scripts/queue-worker.ts --batch-fill 2>&1 | tee -a /tmp/queue-worker.log
  EXIT_CODE=$?
  echo "[$(date)] Worker exited with code $EXIT_CODE, restarting in 30s..."
  sleep 30
done
