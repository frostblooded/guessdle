# 0008: Daily answers are stored on the server

Supersedes ADR 0002. Each day's Daily Answer is drawn at random on the first request of that day and stored in the `daily_answers` table (`day` date, `pet_id`, `source` = `generated` or `override`). Players never receive it until they win or give up (ADR 0010).

- **Today** is the calendar date in `SERVER_TIMEZONE` (default `Europe/Sofia`), so every player switches at one midnight regardless of device clock. The Day Number counts from the start date (2025-08-15, day 0).
- **Generation** (`src/server/answers.ts`) fills every missing day up to the requested one in order, in one transaction under an advisory lock. Each day draws uniformly from the roster minus the previous `ANSWER_SKIP_PERIOD` stored answers, overrides included. Concurrent first requests therefore produce one answer, and the Skip Period holds across days.
- **Backfill**: migration `001_daily_answers.sql` inserts days 0..2026-10-16 from `db/backfill/answers.json`, exported once from the last run of the old replay, so the answer did not change at cutover. Existing rows are kept. The seeded replay, `seedrandom` and the golden fixture are deleted.
- **Overrides**: an admin may set the answer for today or a future day (the gap is generated first) and may clear it. Past days are immutable. Setting or clearing an override on day D re-draws every later non-override day; overridden days are never re-drawn. Stored guesses hold pet ids and victory is derived on read, so overriding today never leaves a stale win.
- **Pet ids**: each pet has a stable lowercase-slug `id`; answers and guesses store ids, so renaming a pet is safe. The roster stays in code. A stored id missing from the roster is an error for that day's calls (`answer_missing`, 500) and is flagged in the admin panel.

## Considered options

- Keep the seeded replay and add an override list: the answer stays in the bundle, and any roster change still rewrites history.
- Pre-generate a fixed number of future days: needs a refill job and still has to freeze them.
- Store on first request (chosen): no scheduler, history is frozen as it is created.

## Consequences

- Changing the roster or the Skip Period no longer rewrites past days (the opposite of ADR 0002).
- Without a usable backup the history is lost. Re-seed from the backfill JSON and resume random generation; days after the backfill get new answers (`docs/backup-runbook.md`).
- Post-launch answers are not reproducible from code; Postgres (and its backups) is the source of truth.
