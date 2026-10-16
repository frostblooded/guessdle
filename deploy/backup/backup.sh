#!/bin/sh
# Nightly dump into daily/, a Sunday copy into weekly/, then prune to 14 daily + 8 weekly.
# Connection comes from PG* env vars. BACKUP_TODAY (YYYY-MM-DD) overrides the date for tests.
set -u
dir="${BACKUP_DIR:-/backups}"
here="$(dirname "$0")"
today="${BACKUP_TODAY:-$(date -u +%F)}"
name="petdle-$today.dump"
mkdir -p "$dir/daily" "$dir/weekly"

if err=$(pg_dump -Fc -f "$dir/daily/$name.part" 2>&1) && mv "$dir/daily/$name.part" "$dir/daily/$name"; then
  # Weekly = the Sunday dump
  [ "$(date -u -d "$today" +%u)" = 7 ] && cp "$dir/daily/$name" "$dir/weekly/$name"
  "$here/prune.sh" "$dir/daily" 14
  "$here/prune.sh" "$dir/weekly" 8
  "$here/status.sh" lastDump ok "$name"
  echo "backup: ok $name"
else
  rm -f "$dir/daily/$name.part"
  "$here/status.sh" lastDump fail "$name" "$err"
  echo "backup: FAILED $name: $err" >&2
  exit 1
fi
