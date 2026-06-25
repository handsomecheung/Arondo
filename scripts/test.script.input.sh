#!/usr/bin/env bash
set -e

cd "$(dirname "${BASH_SOURCE[0]}")"

read -p "Input Your Name: " name

echo "Hello $name"

sleep 30

echo "Bye $name"
