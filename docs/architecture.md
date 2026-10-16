# Architecture

Reference for working on `src/`. Decisions: `docs/adr/`. Terms: `CONTEXT.md`.

## Client

- `src/` holds ES modules (imports use `.ts` extensions). esbuild bundles one entry per page (`scripts/entries.mjs`: `src/script.ts` for Play, `src/pages/{login,verify,admin,how-to-play}.ts`) plus the shared `src/styles.css` into `dist/<name>.js` / `dist/styles.css` (ADR 0012). The pure ones (`date`, `game`, `game-state`, `play`, `correctness`, `roster`) are unit-tested by importing the `.ts` directly under Node's type stripping, so keep them erasable-syntax only (no `enum`) (ADR 0004).
- Pages (clean URLs, one HTML file each in the repo root): `/` `index.html` (Play), `/how-to-play`, `/login`, `/verify` (the emailed link: verifies the token, then goes to Play or explains the failure), `/admin` (client-side 401/403 gate; the API enforces the real check). `src/shell.ts` renders the header (brand, nav, theme button, Sign in / account menu) and footer on every page and returns the signed-in user. Pure sign-in logic (messages, email shape, resend cooldown) is `src/login-logic.ts`; DOM wiring is `src/login.ts`; `src/admin.ts` drives the admin tabs.
- The design system is CSS custom properties in `src/styles.css`; light and dark are one `light-dark()` value per token, and the theme button only flips `color-scheme`.
- `src/game/game.ts` holds the pure guess judging (`gradeIds`); `script.ts` holds the DOM logic; `src/autocomplete.d.ts` types autoComplete; `initTheme` (`src/theme.ts`) wires the theme button.
- `GUESS_DATA` (`src/game/roster.ts`) is the pet roster (`id`, `photo`, `name`, `colors[]`, `owners[]`).
  - Adding a pet = add the photo to `photos/` and an entry with a new, unique, lowercase-slug `id`. Never change a shipped id: guesses are stored and submitted by id (`tests/roster.test.ts` checks uniqueness); the autocomplete shows names.
  - The `Pet` interface makes a missing or misspelled attribute a compile error.
  - The key order of each entry drives table column order in `addGuessResultElement` (iterates `for key in resultData`) and must match the column headers in `index.html` (and the examples in `how-to-play.html`). A new field needs a header in `index.html` and handling in `gradeCorrectness` (strings and arrays only).
- Cell result classes: `correct` / `partially-correct` (arrays sharing an element) / `incorrect`, styled in `src/styles.css`.

## Daily Answer

Stored server-side (`daily_answers`, `src/server/answers.ts`), never in the bundle (ADR 0008, 0010).

- Drawn at random on the first request of a day. All missing days fill in order under an advisory lock, skipping the previous `ANSWER_SKIP_PERIOD` answers.
- "Today" is the date in `SERVER_TIMEZONE` (default Europe/Sofia). Roster changes no longer rewrite past days.
- Migration `db/migrations/001_daily_answers.sql` backfills days 0..2026-10-16 from `db/backfill/answers.json`.

## Play

- Anonymous (`createPlay`, `src/game/play.ts`): pet ids live in `localStorage` (`createGameState`, `src/game/game-state.ts`: a missing or other-day `lastPlayed`, or a newer server `day`, clears them; blocked storage falls back to memory; legacy name-keyed state is upgraded). `POST /api/grade {ids}` returns `{day, rows, victory, answer?}`, `answer` only on victory. `POST /api/give-up` is stateless and open to anyone by decision. Every response carries the Day Number; a client seeing a newer day resets itself (`onNewDay`).
- Signed in: email magic link (`src/server/email-login.ts`, `mailer.ts`, ADR 0011; the mail links to `${PUBLIC_URL}/verify?token=...`; client `src/login.ts`, `src/pages/verify.ts`), Postgres sessions (`src/server/auth.ts`). `GET /api/game` and `POST /api/game/guess|give-up|merge|reset` store ids per user and day (`src/server/user-game.ts`, client `src/game/server-play.ts`); victory is derived on read. `merge` adopts leftover anonymous guesses on login (`src/game/merge.ts`).
- Routes live in `src/server/routes/` (`auth`, `game`, `admin`), each taking one `AppContext`.

## Admin

`/api/admin/answers|users|backup` and the `/admin` page (`src/admin.ts`, tabs Answers, Users, Backups): peek and override answers (today or future only; later generated days are re-drawn), promote or demote users (no self or last-admin demotion), show backup age.

## Uploads

`POST /api/uploads?kind=photo|cover` (signed in, raw bytes as `application/octet-stream`, 5 MB) runs `src/server/images.ts`: type by magic bytes (JPEG, PNG, WebP), sharp resize (photo 800px, cover 1200px), WebP re-encode, random-hex name in `UPLOADS_DIR` (default `./uploads`); answers `{url: "/uploads/<hex>.webp"}` or 413 `too_large`, 415 `unsupported`, 422 `corrupt`. Prod: the `uploads` named volume is rw for `api`, ro for nginx (`/uploads/`, `/api/uploads` body cap 5m). The dev server serves the same folder. Hygiene (`src/server/upload-store.ts`, table `uploads`): per-user rate limit (60/hour, `uploadLimit`) and byte quota (200 MB, 403 `quota_exceeded`); `removeUpload` deletes file and quota row (call it on replace, remove and game delete); `main.ts` sweeps at start and every 24h, deleting files older than 1 day that `referencedUrls` does not list (extend it when tables store upload URLs).

## Server

- Rate limits: nginx and `src/server/rate-limit.ts`. `/api/test/login` exists only with `NODE_ENV=test`.
- Migrations: `db/migrations/*.sql`, applied at startup.
- Deploy, env keys, backups: `docs/deploy.md`.

## Tests

- `npm run test:integration` runs the HTTP API against Testcontainers Postgres (needs Docker).
- Page URLs are served by `scripts/server.mjs` (dev) and `location /` `try_files` in `deploy/nginx.conf` (prod); `tests/e2e/server.spec.ts` and `tests/build-wiring.test.ts` cover both lists.
- `npm run test:e2e` starts a Testcontainers Postgres and Mailpit via `tests/e2e/serve.ts` (needs Docker); sign-in mail is read back through Mailpit's API. One integration test delivers through real nodemailer to Mailpit. The Daily Answer is random there; tests learn it through the API.
