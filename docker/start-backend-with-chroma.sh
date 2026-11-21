#!/usr/bin/env bash
set -euo pipefail

# Run Chroma inside the backend container so Node connects over localhost.
# The Free Render filesystem is intentionally ephemeral; vector data may reset
# when the service restarts, as accepted for this deployment.
export IS_PERSISTENT=TRUE
export ANONYMIZED_TELEMETRY=FALSE
export OMP_NUM_THREADS=1
export OPENBLAS_NUM_THREADS=1

/opt/chroma-venv/bin/chroma run --host 127.0.0.1 --port 8000 --path /tmp/chroma &
CHROMA_PID=$!

cleanup() {
  kill "$CHROMA_PID" 2>/dev/null || true
}
trap cleanup EXIT

# Wait up to 90 seconds for Chroma to become ready before starting the API.
for attempt in $(seq 1 90); do
  if python3 -c 'import urllib.request; urllib.request.urlopen("http://127.0.0.1:8000/api/v2/heartbeat", timeout=2).read()' >/dev/null 2>&1; then
    echo "Local ChromaDB is ready."
    exec node src/server.js
  fi
  if ! kill -0 "$CHROMA_PID" 2>/dev/null; then
    echo "ChromaDB process exited during startup."
    wait "$CHROMA_PID" || true
    exit 1
  fi
  sleep 1
done

echo "ChromaDB did not become ready within 90 seconds."
exit 1
