#!/usr/bin/env bash
set -e

cd "$(dirname "${BASH_SOURCE[0]}")"

runner_version=$(awk -F '"' '$2 == "version" { print $4; exit }' ../package.json)
test -n "$runner_version"
CGO_ENABLED=0 go build -ldflags "-X main.Version=$runner_version" -o "${1:-arondo-runner}" .
