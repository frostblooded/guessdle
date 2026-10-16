#!/bin/sh
# Sidecar entrypoint: hourly check. Dump if today's is missing; restore-test the newest dump unless
# the last restore test passed within 7 days. A failure is retried at the next check.
dir="${BACKUP_DIR:-/backups}"
here="$(dirname "$0")"
while true; do
  # The sidecar can start before the API migrates; a dump of the empty DB would block today's real one
  if [ -z "$(psql -At -c "select to_regclass('public.daily_answers')" 2>/dev/null)" ]; then
    echo "backup: schema not migrated yet, retrying in an hour" >&2
    sleep 3600
    continue
  fi
  [ -e "$dir/daily/petdle-$(date -u +%F).dump" ] || "$here/backup.sh"
  if ! jq -e '.lastRestore.ok == true and (now - (.lastRestore.time | fromdate)) < 604800' "$dir/status.json" >/dev/null 2>&1; then
    newest=$(ls "$dir"/daily/*.dump 2>/dev/null | sort | tail -n 1)
    [ -z "$newest" ] || "$here/restore-test.sh" "$newest"
  fi
  sleep 3600
done
