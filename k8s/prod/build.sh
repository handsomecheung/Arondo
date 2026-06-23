#!/usr/bin/env bash
set -e

cd "$(dirname "${BASH_SOURCE[0]}")"

current=$(pwd)
root="${current}/../.."
target="${current}/data"

rm -rf "${target}"
mkdir "${target}"

rsync -avL --progress "${root}/" --exclude="data/" --exclude="node_modules/" --exclude=".env.local" --exclude=".next/" --exclude="k8s/prod/data/" "${target}"

my-k8s-build-image "cloudpublic/default/itero:latest" default itero-prod

rm -rf "${target}"
