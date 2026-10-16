#!/bin/sh
# Nightly dump into daily/, a Sunday copy into weekly/, then prune to 14 daily + 8 weekly.
# Connection comes from PG* env vars. BACKUP_TODAY (YYYY-MM-DD) overrides the date for tests.
set -u
dir="${BACKUP_DIR:-/backups}"
here="$(dirname "$0")"
today="${BACKUP_TODAY:-$(date -u +%F)}"
name="petdle-$today.dump"
# Uploaded images (read-only mount in prod); skipped when the folder is not mounted
uploads="${UPLOADS_DIR:-/uploads}"
mkdir -p "$dir/daily" "$dir/weekly" "$dir/uploads"

backup_uploads() {
  [ -d "$uploads" ] || return 0
  tar -cf "$dir/uploads/petdle-$today.tar.part" -C "$uploads" . &&
    mv "$dir/uploads/petdle-$today.tar.part" "$dir/uploads/petdle-$today.tar"
}

if err=$(pg_dump -Fc -f "$dir/daily/$name.part" 2>&1) && mv "$dir/daily/$name.part" "$dir/daily/$name"; then
  # A failed image copy is a failed backup: record it, keep the good dump
  if ! err=$(backup_uploads 2>&1); then
    rm -f "$dir/uploads/petdle-$today.tar.part"
    "$here/status.sh" lastDump fail "$name" "uploads: $err"
    echo "backup: FAILED uploads $name: $err" >&2
    exit 1
  fi
  "$here/prune.sh" "$dir/uploads" 14 tar
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
