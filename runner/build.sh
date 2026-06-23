#!/bin/bash
set -e

cd "$(dirname "${BASH_SOURCE[0]}")"

CGO_ENABLED=0 go build -o runner .
