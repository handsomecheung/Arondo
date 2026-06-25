#!/usr/bin/env bash
set -e

cd "$(dirname "${BASH_SOURCE[0]}")"

seconds=${1:-30}

echo "Sleeping for ${seconds} seconds..."

sleep "${seconds}"

echo "Done sleeping for $seconds seconds."
