#!/bin/sh
# Update and (re)start the prod stack on the home server.
set -eu
cd "$(dirname "$0")"
git pull --ff-only
docker compose -f compose.prod.yaml down --remove-orphans
# A leftover from an older run (other compose project or plain docker run) holds the fixed name; `down` cannot see it
docker rm -f guessdle-server >/dev/null 2>&1 || true
# --wait fails the deploy job when a service never gets healthy (an API crash loop once stayed
# behind a green deploy for five hours). Details: the Server logs workflow (docs/deploy.md).
if ! docker compose -f compose.prod.yaml up -d --build --wait --wait-timeout 180; then
  docker compose -f compose.prod.yaml ps -a
  echo "Deploy failed: the stack did not come up healthy. Run the Server logs workflow for details." >&2
  exit 1
fi
