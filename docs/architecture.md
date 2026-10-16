# Architecture

Reference for working on `src/`. Decisions: `docs/adr/`. Terms: `CONTEXT.md`.

## Client

- `src/` holds ES modules (imports use `.ts` extensions). esbuild bundles one entry per page (`scripts/entries.mjs`: `src/script.ts` for Play, `src/pages/{login,verify,admin,how-to-play}.ts`) plus the shared `src/styles.css` into `dist/<name>.js` / `dist/styles.css` (ADR 0012). The pure ones (`date`, `game`, `game-state`, `play`, `correctness`, `roster`) are unit-tested by importing the `.ts` directly under Node's type stripping, so keep them erasable-syntax only (no `enum`) (ADR 0004).
- Pages (clean URLs, one HTML file each in the repo root): `/` `index.html` (Play), `/how-to-play`, `/login`, `/verify` (the emailed link: verifies the token, then goes to Play or explains the failure), `/admin` (client-side 401/403 gate; the API enforces the real check). `src/shell.ts` renders the header (brand, nav, theme button, Sign in / account menu) and footer on every page and returns the signed-in user. Pure sign-in logic (messages, email shape, resend cooldown) is `src/login-logic.ts`; DOM wiring is `src/login.ts`; `src/admin.ts` drives the admin tabs.
- The design system is CSS custom properties in `src/styles.css`; light and dark are one `light-dark()` value per token, and the theme button only flips `color-scheme`.
- `src/game/game.ts` holds the pure guess judging (`gradeIds`); `script.ts` holds the DOM logic; `src/autocomplete.d.ts` types autoComplete; `initTheme` (`src/theme.ts`) wires the theme button.
- The roster lives in Postgres (`games`, `attributes`, `entries`, `entry_values`; migration `005_games.sql` moved Petdle in as game `petdle`). `GET /api/games/:slug` gives the page the game's attributes and active entries (`id`, `name`, `photo`); the board columns are Photo, Name, then the game's attributes. Guesses are numeric entry ids. Service seam: `src/server/games.ts` (`findGame`, `loadRoster`).
  - Attribute types: Text (exact match) and List (same set correct, shared value partially correct); grades are never stored (ADR 0013).
- Cell result classes: `correct` / `partially-correct` (arrays sharing an element) / `incorrect`, styled in `src/styles.css`.

## Daily Answer

Stored server-side per game (`daily_answers` keyed by game and date, `src/server/answers.ts`), never in the bundle (ADR 0008, 0010). Day 0 is the game's `start_date`.

- Drawn at random on the first request of a day. All missing days fill in order under an advisory lock, skipping the previous Skip Period answers (the game's `skip_period`, default 5, clamped to N-1).
- "Today" is the date in `SERVER_TIMEZONE` (default Europe/Sofia). Roster changes no longer rewrite past days.
- Migration `db/migrations/001_daily_answers.sql` backfills days 0..2026-10-16 from `db/backfill/answers.json`.

## Play

- Anonymous (`createPlay`, `src/game/play.ts`): entry ids live in `localStorage` under `game:<slug>:` keys (`createGameState`, `src/game/game-state.ts`: a missing or other-day `lastPlayed`, or a newer server `day`, clears them; blocked storage falls back to memory; legacy name-keyed state is upgraded). `POST /api/games/:slug/grade {ids}` returns `{day, rows, victory, answer?}`, `answer` only on victory. `POST /api/games/:slug/give-up` is stateless and open to anyone by decision. Every response carries the Day Number; a client seeing a newer day resets itself (`onNewDay`).
- Signed in: email magic link (`src/server/email-login.ts`, `mailer.ts`, ADR 0011; the mail links to `${PUBLIC_URL}/verify?token=...`; client `src/login.ts`, `src/pages/verify.ts`), Postgres sessions (`src/server/auth.ts`). `GET /api/games/:slug/state` and `POST /api/games/:slug/state/guess|give-up|merge|reset` store ids per user and day (`src/server/user-game.ts`, client `src/game/server-play.ts`); victory is derived on read. `merge` adopts leftover anonymous guesses on login (`src/game/merge.ts`).
- A draft game, or one with fewer than 2 active entries, is a 404 except to its owner and admins (`loadGame`, `routes/context.ts`).
- Routes live in `src/server/routes/` (`auth`, `game`, `answers`, `admin`), each taking one `AppContext`.

## Admin

`/api/admin/users|backup` and the `/admin` page (`src/admin.ts`, tabs Answers, Users, Backups). Answers peek/override is per game, owner or admin: `/api/games/:slug/answers` (the admin tab edits Petdle): peek and override answers (today or future only; later generated days are re-drawn), promote or demote users (no self or last-admin demotion), show backup age.

## Server

- Rate limits: nginx and `src/server/rate-limit.ts`. `/api/test/login` exists only with `NODE_ENV=test`.
- Migrations: `db/migrations/*.sql`, applied at startup.
- Deploy, env keys, backups: `docs/deploy.md`.

## Tests

- `npm run test:integration` runs the HTTP API against Testcontainers Postgres (needs Docker).
- Page URLs are served by `scripts/server.mjs` (dev) and `location /` `try_files` in `deploy/nginx.conf` (prod); `tests/e2e/server.spec.ts` and `tests/build-wiring.test.ts` cover both lists.
- `npm run test:e2e` starts a Testcontainers Postgres and Mailpit via `tests/e2e/serve.ts` (needs Docker); sign-in mail is read back through Mailpit's API. One integration test delivers through real nodemailer to Mailpit. The Daily Answer is random there; tests learn it through the API.
