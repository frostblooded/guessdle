#!/bin/sh
# Usage: status.sh <lastDump|lastRestore> <ok|fail> <file> [error]
# Merges one entry into $BACKUP_DIR/status.json (format: docs/backup-runbook.md).
set -eu
f="${BACKUP_DIR:-/backups}/status.json"
[ -s "$f" ] || echo '{}' > "$f"
jq --arg k "$1" --arg ok "$2" --arg file "$3" --arg err "${4:-}" --arg t "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  '.[$k] = ({time: $t, ok: ($ok == "ok"), file: $file} + (if $err == "" then {} else {error: $err} end))' \
  "$f" > "$f.tmp"
mv "$f.tmp" "$f"
