#!/usr/bin/env bash
set -e

cd "$(dirname "${BASH_SOURCE[0]}")/../runner"

go test -v
