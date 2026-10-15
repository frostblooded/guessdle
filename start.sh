#!/bin/sh
# Update and (re)start the prod stack on the home server.
set -eu
cd "$(dirname "$0")"
git pull --ff-only
docker compose -f compose.prod.yaml up -d --build
