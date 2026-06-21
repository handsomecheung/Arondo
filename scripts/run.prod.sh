#!/usr/bin/env bash
set -ex

# Go to the project root directory (parent of scripts/)
cd "$(dirname "${BASH_SOURCE[0]}")/.."

PORT=3250

# Stop previous process if it exists
PID=$(ss -lptn | grep -E ":${PORT}\b" | grep -oE 'pid=[0-9]+' | cut -d= -f2)
if [ -n "$PID" ]; then
  echo "Stopping previous process on port ${PORT} (PID: ${PID})..."
  kill ${PID} 2>/dev/null || true
  sleep 1
  kill -9 ${PID} 2>/dev/null || true
fi

SH_PID=$(pgrep -f "next start -p ${PORT}" || true)
if [ -n "$SH_PID" ]; then
  kill ${SH_PID} 2>/dev/null || true
fi

nohup sh -c 'npm run build && npm run start' >/tmp/itero.prod.log 2>&1 &
