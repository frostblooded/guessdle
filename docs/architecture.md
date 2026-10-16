# Architecture

Reference for working on `src/`. Decisions: `docs/adr/`. Terms: `CONTEXT.md`.

## Client

- `src/` holds ES modules (imports use `.ts` extensions) bundled from `src/script.ts` into `dist/script.js` + `dist/script.css`. The pure ones (`date`, `game`, `game-state`, `play`, `correctness`, `roster`) are unit-tested by importing the `.ts` directly under Node's type stripping, so keep them erasable-syntax only (no `enum`) (ADR 0004).
- `src/game/game.ts` holds the pure guess judging (`gradeIds`); `script.ts` holds the DOM logic; `src/autocomplete.d.ts` types autoComplete; `initTheme` (`src/theme.ts`) wires the theme button.
- `GUESS_DATA` (`src/game/roster.ts`) is the pet roster (`id`, `photo`, `name`, `colors[]`, `owners[]`).
  - Adding a pet = add the photo to `photos/` and an entry with a new, unique, lowercase-slug `id`. Never change a shipped id: guesses are stored and submitted by id (`tests/roster.test.ts` checks uniqueness); the autocomplete shows names.
  - The `Pet` interface makes a missing or misspelled attribute a compile error.
  - The key order of each entry drives table column order in `addGuessResultElement` (iterates `for key in resultData`) and must match the column headers in `index.html`. A new field needs a header in `index.html` and handling in `gradeCorrectness` (strings and arrays only).
- Cell result classes: `correct` / `partially-correct` (arrays sharing an element) / `incorrect`, styled in `styles.css`.

## Daily Answer

Stored server-side (`daily_answers`, `src/server/answers.ts`), never in the bundle (ADR 0008, 0010).

- Drawn at random on the first request of a day. All missing days fill in order under an advisory lock, skipping the previous `ANSWER_SKIP_PERIOD` answers.
- "Today" is the date in `SERVER_TIMEZONE` (default Europe/Sofia). Roster changes no longer rewrite past days.
- Migration `db/migrations/001_daily_answers.sql` backfills days 0..2026-10-16 from `db/backfill/answers.json`.

## Play

- Anonymous (`createPlay`, `src/game/play.ts`): pet ids live in `localStorage` (`createGameState`, `src/game/game-state.ts`: a missing or other-day `lastPlayed`, or a newer server `day`, clears them; blocked storage falls back to memory; legacy name-keyed state is upgraded). `POST /api/grade {ids}` returns `{day, rows, victory, answer?}`, `answer` only on victory. `POST /api/give-up` is stateless and open to anyone by decision. Every response carries the Day Number; a client seeing a newer day resets itself (`onNewDay`).
- Signed in: email magic link (`src/server/email-login.ts`, `mailer.ts`, ADR 0011; client `src/login.ts`), Postgres sessions (`src/server/auth.ts`). `GET /api/game` and `POST /api/game/guess|give-up|merge|reset` store ids per user and day (`src/server/user-game.ts`, client `src/game/server-play.ts`); victory is derived on read. `merge` adopts leftover anonymous guesses on login (`src/game/merge.ts`).
- Routes live in `src/server/routes/` (`auth`, `game`, `admin`), each taking one `AppContext`.

## Admin

`/api/admin/answers|users|backup` and the `src/admin.ts` panel: peek and override answers (today or future only; later generated days are re-drawn), promote or demote users (no self or last-admin demotion), show backup age.

## Server

- Rate limits: nginx and `src/server/rate-limit.ts`. `/api/test/login` exists only with `NODE_ENV=test`.
- Migrations: `db/migrations/*.sql`, applied at startup.
- Deploy, env keys, backups: `docs/deploy.md`.

## Tests

- `npm run test:integration` runs the HTTP API against Testcontainers Postgres (needs Docker).
- `npm run test:e2e` starts a Testcontainers Postgres and Mailpit via `tests/e2e/serve.ts` (needs Docker); sign-in mail is read back through Mailpit's API. One integration test delivers through real nodemailer to Mailpit. The Daily Answer is random there; tests learn it through the API.
