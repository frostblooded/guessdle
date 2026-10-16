# Backup runbook

The `backup` compose service (`deploy/backup/`, Dockerfile target `backup`) protects the Postgres data. Dumps hold user emails: never copy them into the repo or share them. There is no offsite copy; losing the disk or Docker data loses the data and its backups together.

## What it does

- `loop.sh` checks hourly. If today's (UTC) dump is missing it runs `backup.sh`: `pg_dump -Fc` (compressed, version-portable) to `daily/petdle-YYYY-MM-DD.dump` in the named volume `backups`. On Sundays it also copies the dump to `weekly/`.
- `prune.sh` keeps the newest 14 files in `daily/` and 8 in `weekly/`.
- Unless the last restore test passed in the past 7 days, `restore-test.sh` restores the newest daily dump into a throwaway Postgres started inside the sidecar, then requires `select count(*) from daily_answers` > 0.
- A failed dump or restore test is retried at the next hourly check and logged: `docker compose -f deploy/compose.prod.yaml logs backup`.
- `api` mounts the volume read-only at `/backups`.

## Status file

`/backups/status.json`, rewritten atomically after every dump and restore-test attempt. Each key holds the latest attempt of that kind:

```json
{
  "lastDump": {
    "time": "2026-10-16T03:00:02Z",
    "ok": true,
    "file": "petdle-2026-10-16.dump"
  },
  "lastRestore": {
    "time": "2026-10-12T03:00:09Z",
    "ok": false,
    "file": "petdle-2026-10-12.dump",
    "error": "pg_restore: ..."
  }
}
```

`time` is UTC ISO 8601, `error` appears only when `ok` is false, and a key is absent until its first attempt. A consumer should show red when `lastDump` is missing, not `ok`, or older than 36 hours, or when `lastRestore` exists with `ok: false`. After a failed dump the file still names the failed attempt, so `lastDump.ok` is what to check, not just the time.

## Manual restore

1. Stop the writers: `docker compose -f deploy/compose.prod.yaml stop web api`.
2. List dumps: `docker compose -f deploy/compose.prod.yaml exec backup ls /backups/daily /backups/weekly`.
3. Restore into a fresh database (this replaces the data; the dump contains the whole schema):
   ```sh
   docker compose -f deploy/compose.prod.yaml exec backup sh -c \
     'dropdb --if-exists petdle && createdb petdle && pg_restore --no-owner -d petdle /backups/daily/petdle-YYYY-MM-DD.dump'
   ```
   If `dropdb` is refused because the API holds connections, `stop api` first (step 1) or run `select pg_terminate_backend(pid) from pg_stat_activity where datname = 'petdle' and pid <> pg_backend_pid()`.
4. Start again: `docker compose -f deploy/compose.prod.yaml up -d`, then check `/api/health`.

To get a dump out of the volume (for example before wiping the host): `docker cp "$(docker compose -f deploy/compose.prod.yaml ps -q backup)":/backups ./backups-copy`. `/backups` and `*.dump` are gitignored; keep the copy outside the repo.

## No usable backup: re-seed

Dumps lost or all corrupt: start with an empty database and let the API migrate it.

1. `docker compose -f deploy/compose.prod.yaml down`, then remove the `db-data` volume (`docker volume rm`, name prefixed by the compose project).
2. `up -d`. Migration `001_daily_answers.sql` inserts the committed backfill (`db/backfill/answers.json`, days up to 2026-10-16); the API then generates later days at random on first request.
3. Accepted loss: days after the backfill get new answers (players may see a different answer for a past day), and all users, sessions and server-side Game State are gone. Players sign in again; the `ADMIN_EMAILS` list re-promotes admins.

## Tests

`npm run test:integration` runs `tests/integration/backup.test.ts` against the real sidecar image: healthy dump and restore, corrupt dump, empty history, failing `pg_dump`, and the 14/8 retention.
