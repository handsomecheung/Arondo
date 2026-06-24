#!/usr/bin/env bash
set -ex

cd "$(dirname "${BASH_SOURCE[0]}")/"
source .env

# Stop previous process if it exists
pids=$(pgrep -f "runner --server wss://${ARONDO_HOST_SERVER_PROD}/runner --name devbox-nur" || true)
if [ -n "$pids" ]; then
  echo "Stopping previous runner processes: $pids"
  kill $pids || true
  for pid in $pids; do
    while kill -0 $pid 2>/dev/null; do
      sleep 0.1
    done
  done
fi

nohup bash -c "../runner/build.sh && ../runner/runner --server wss://${ARONDO_HOST_SERVER_PROD}/runner --name devbox-nur" >/tmp/arondo.runner.prod.log 2>&1 &
