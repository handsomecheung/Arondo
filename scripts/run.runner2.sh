#!/usr/bin/env bash
set -e

cd "$(dirname "${BASH_SOURCE[0]}")"
source .env

ps aux | grep -v grep | grep 'runner --' | grep "${ARONDO_RUNNER_TOKEN_LOCALDEV2}" | awk '{print $2}' | xargs -r kill

cd ../runner
go run . --server ws://localhost:3251/runner --token "${ARONDO_RUNNER_TOKEN_LOCALDEV2}"
