#!/usr/bin/env bash
set -e

cd "$(dirname "${BASH_SOURCE[0]}")"

echo "Sleeping for 10 seconds and then exit with 1..."

sleep 10

echo "Exit with 1"

exit 1
