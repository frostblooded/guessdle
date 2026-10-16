# 0009: nginx, a Node API and Postgres

Production runs four compose services (`deploy/compose.prod.yaml`):

- `web`: the existing nginx static server (container `guessdle-server`, port 8080). The only service on the external tunnel network, so the Cloudflare tunnel target is unchanged. It proxies `/api/` to `api`, so the browser sees one origin.
- `api`: Express (`src/server/`, port 3000, internal only). Plain SQL through `pg`, no ORM. Migrations (`db/migrations/*.sql`) are numbered files applied at startup, each in a transaction, tracked in a migrations table.
- `db`: Postgres 17 on the private `internal` network with a named volume and no published port.
- `backup`: sidecar doing nightly dumps and a weekly restore test onto a separate volume that `api` mounts read-only (backup age in the admin panel; `docs/backup-runbook.md`).

Dev: `scripts/server.mjs` serves static files and mounts the same Express app in one Node process; `deploy/compose.yaml` adds a Postgres service. There is no nginx in dev. Without `DATABASE_URL` only static files are served.

- **Auth**: Google OAuth only (Passport), email-verified accounts only, no linking. Users are keyed by the Google subject. Sessions are opaque random tokens in an HttpOnly, Secure, SameSite=Lax cookie; only a hash is stored in `sessions` (30-day rolling lifetime), so deleting a row revokes access on the next request. `ADMIN_EMAILS` promotes on login and never demotes. CSRF defence: SameSite=Lax, JSON-only mutating endpoints and an Origin check.
- **Abuse protection** (floods only, starting values): nginx limits per IP (60/min, burst 30 on `/api/`; 10/min, burst 5 on login routes) using `CF-Connecting-IP` trusted only from private networks; Express limits per user (per IP when anonymous, 120/min, `trust proxy` one hop). Bodies are capped at 10 KB. Both layers answer 429 and the client treats them alike.
- **Secrets** live in an untracked `deploy/.env`; keys are listed in `docs/deploy.md`.
- **Tests**: HTTP integration tests and Playwright e2e run against Testcontainers Postgres. A test-only login route exists only with `NODE_ENV=test` and is refused under `production`.

## Considered options

- Serverless or hosted database: new accounts and cost, while the home server and tunnel already exist.
- Merge static serving into the Node API in production: one fewer container, but loses nginx caching, the cheap first rate limit and the unchanged tunnel target.
- Separate nginx, API and Postgres (chosen).

## Consequences

- A deploy now depends on Docker volumes and Postgres health; `/api/health` returns 503 when the database is unreachable.
- Express is a runtime dependency (plus `pg`, Passport).
- No offsite backup (accepted); dumps contain user emails and must not enter the repo.
