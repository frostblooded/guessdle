#!/bin/sh
# Usage: restore-test.sh <dump>: restore into a throwaway local Postgres, run a sanity query.
# Records the result in status.json; exits non-zero on failure.
set -u
dir="${BACKUP_DIR:-/backups}"
here="$(dirname "$0")"
dump="$1"
name="$(basename "$dump")"
scratch="$(mktemp -d)"
sock="$scratch/sock"
mkdir "$sock"

fail() {
  pg_ctl -D "$scratch/data" -m immediate stop >/dev/null 2>&1
  rm -rf "$scratch"
  "$here/status.sh" lastRestore fail "$name" "$1"
  echo "restore-test: FAILED $name: $1" >&2
  exit 1
}

initdb -D "$scratch/data" -A trust >/dev/null || fail "initdb failed"
pg_ctl -D "$scratch/data" -w -o "-k $sock -c listen_addresses=''" start >/dev/null || fail "scratch postgres did not start"
# The scratch server is local and private: unset PG* so the production connection is never used
export PGHOST="$sock" PGUSER="$(id -un)" PGPASSWORD=
createdb scratch || fail "createdb failed"
pg_restore --no-owner --exit-on-error -d scratch "$dump" 2>"$scratch/err" || fail "pg_restore: $(head -c 500 "$scratch/err")"
# Sanity: the answer history must not be empty
n=$(psql -At -d scratch -c "select count(*) from daily_answers" 2>&1) || fail "sanity query: $n"
[ "$n" -gt 0 ] 2>/dev/null || fail "sanity query: daily_answers has $n rows"

pg_ctl -D "$scratch/data" -m immediate stop >/dev/null 2>&1
rm -rf "$scratch"
"$here/status.sh" lastRestore ok "$name"
echo "restore-test: ok $name ($n answers)"
