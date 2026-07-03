#!/usr/bin/env bash
set -e

cd "$(dirname "${BASH_SOURCE[0]}")/../runner"

name=local-dev1
ps aux | grep -v grep | grep 'runner --' | grep "${name}" | awk '{print $2}' | xargs -r kill
go run . --server ws://localhost:3251/runner --name "${name}"
