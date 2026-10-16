#!/bin/sh
# Update and (re)start the prod stack on the home server.
set -eu
cd "$(dirname "$0")"
git pull --ff-only
docker compose -f compose.prod.yaml down --remove-orphans
# A leftover from an older run (other compose project or plain docker run) holds the fixed name; `down` cannot see it
docker rm -f guessdle-server >/dev/null 2>&1 || true
docker compose -f compose.prod.yaml up -d --build
