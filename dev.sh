#!/bin/bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

# Start backend
echo "[backend] Starting on :8001 ..."
cd "$ROOT/backend"
if [ ! -d ".venv" ]; then
  echo "[backend] No .venv found. Run: python3 -m venv .venv && .venv/bin/pip install -r requirements.txt"
  exit 1
fi
source .venv/bin/activate
uvicorn server:app --reload --port 8001 --host 0.0.0.0 &
BACKEND_PID=$!

# Give backend a moment to bind
sleep 1

# Start frontend
echo "[frontend] Starting on LAN :3000 ..."
cd "$ROOT/frontend"
if ! command -v yarn >/dev/null 2>&1; then
  echo "[frontend] yarn not found. Run: npm install --global yarn"
  kill "$BACKEND_PID" 2>/dev/null || true
  exit 1
fi
yarn start:local

# Cleanup on exit
kill "$BACKEND_PID" 2>/dev/null || true
