#!/usr/bin/env bash
set -e

cd "$(dirname "${BASH_SOURCE[0]}")"
source .env

ps aux | grep -v grep | grep "$(pwd)" | grep 'server.ts' | awk '{print $2}' | xargs -r kill -9

cd ..
npm run dev
