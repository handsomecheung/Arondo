#!/bin/bash
set -e

cd "$(dirname "${BASH_SOURCE[0]}")"

CGO_ENABLED=0 GOOS=darwin GOARCH=arm64 go build -o runner-macos-arm64 .
