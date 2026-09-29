#!/usr/bin/env bash
set -e

cd "$(dirname "${BASH_SOURCE[0]}")"

echo "sleep 5 seconds"
sleep 5

read -p "Input Your Name: " name

echo "Hello $name"

echo "sleep 30 seconds"
sleep 30

echo "Bye $name"
