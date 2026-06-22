#!/usr/bin/env bash
set -e

cd "$(dirname "${BASH_SOURCE[0]}")/../controller"

go run . --server ws://localhost:3251/controller --name local-dev
