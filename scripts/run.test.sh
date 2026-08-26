#!/usr/bin/env bash
set -e

CURRENT=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )

cd "${CURRENT}/.."

./runner/build.sh

npm run test:integration

cd "${CURRENT}/../runner"

go test -v

cd "${CURRENT}/../cli"

go test -v
