#!/usr/bin/env bash
set -e

cd "$(dirname "${BASH_SOURCE[0]}")/../runner"

go run . --server ws://localhost:3251/runner --name local-dev1
