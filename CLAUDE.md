# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

"Petdle": a Wordle-style daily guessing game where players guess a pet from a fixed roster. Static front-end (`index.html`, `src/script.ts`, `styles.css`) served by a Node server (`scripts/server.mjs`) that also mounts the Express API (`src/server/`) backed by Postgres (ADRs 0008-0010). Strict TypeScript, ES modules bundled by esbuild into `dist/` (gitignored, ADR 0001); `tsc` only type-checks (Node 24, see `.nvmrc`). ESLint (`npm run lint`, typescript-eslint) lints; Prettier formats. `typescript` is pinned `~6.0` because typescript-eslint does not support 7 yet. Libs come from npm (`@tarekraafat/autocomplete.js`, `express`, `pg`).

## Commands

Scripts are in `package.json`.

- `npm start` must run from the repo root (the static dir is the relative path `./`). Run `npm run build` first: `index.html` loads `dist/`.
- A `PostToolUse` hook (`.claude/hooks/prettier.mjs`) runs `eslint --fix` then Prettier on edited `.ts`/`.mjs` files; lint errors it cannot fix come back as hook feedback.
- Deploy uses `npm run build:prod` (`scripts/build-prod.mjs`: minified, no sourcemaps, content-hashed names, writes `dist/index.html`; ADR 0007; issue #6). GitHub Pages serves only `deploy/redirect.html` (ADR 0005); the game deploys to the home server from `prod`.
- `npm run test:e2e` needs Chromium once: `npx playwright install chromium`.
- Edits to `.ts` need `npm run build` (or `npm run watch`) before the browser refresh. HTML/CSS need only a refresh.

## Architecture

- Source files live in `src/` and are ES modules (imports use `.ts` extensions) bundled from `src/script.ts` into `dist/script.js` + `dist/script.css`. The pure ones (`date`, `game`, `game-state`, `play`, `correctness`, `roster`) are unit-tested by importing the `.ts` directly under Node's type stripping, so keep them erasable-syntax only (no `enum`) (ADR 0004). `src/game/game.ts` holds the pure game flow (guess judging; the server picks the Daily Answer); `script.ts` holds the DOM logic. `src/autocomplete.d.ts` types autoComplete.
  - `GUESS_DATA` (in `src/game/roster.ts`) is the pet roster (`id`, `photo`, `name`, `colors[]`, `owners[]`). Adding a pet = add photo to `photos/` and an entry here with a new, unique, lowercase-slug `id` (never change a shipped id; `tests/roster.test.ts` checks uniqueness; guesses are stored and submitted by id, the autocomplete shows names); the `Pet` interface makes a missing or misspelled attribute a compile error. The key order of each entry drives table column order in `addGuessResultElement` (iterates `for key in resultData`), and must match the column headers in `index.html`. Adding a new field needs a header in `index.html` and handling in `gradeCorrectness` (supports only strings and arrays).
  - The Daily Answer is stored server-side (`daily_answers` table, `src/server/answers.ts`), drawn at random on the first request of a day (all missing days filled in order under an advisory lock, skipping the previous `ANSWER_SKIP_PERIOD` answers) and never shipped in the bundle. Migration `db/migrations/001_daily_answers.sql` backfills days 0..2026-10-16 from `db/backfill/answers.json` (exported once from the old seeded replay, ADR 0002, which is gone; changing the roster no longer rewrites past days). "Today" is the date in `SERVER_TIMEZONE` (default Europe/Sofia).
  - Anonymous play (`src/game/play.ts`): the browser keeps pet ids in `localStorage` and `POST /api/grade` grades them; `POST /api/give-up` (stateless, open to anyone by decision) reveals the answer. Every response carries the Day Number; a client seeing a newer day than its stored one resets itself (`onNewDay`). After a win or give-up the input is replaced by a reset button that clears local state.
  - `POST /api/grade {ids}` (`src/server/app.ts`) grades pet ids statelessly with `gradeIds` (`src/game/game.ts`) and returns `{day, rows, victory, answer?}`; `answer` (a name) only on victory. `createPlay` (`src/game/play.ts`) is what `script.ts` uses: it keeps ids in `localStorage` (`createGameState`, `src/game/game-state.ts`: a missing or other-day `lastPlayed` clears them; the server `day` clears them too), upgrades legacy name-keyed state, and posts them to the API. Blocked storage falls back to memory. `initTheme` (`src/theme.ts`) wires the theme button.
  - `npm run test:e2e` starts a Testcontainers Postgres via `tests/e2e/serve.ts` (needs Docker); the Daily Answer is random there, tests learn it through the API.
  - Signed-in play: Google OAuth (`src/server/auth.ts`), Postgres sessions, `GET /api/game` and `POST /api/game/guess|give-up|merge|reset` store pet ids per user and day (`src/server/user-game.ts`, `src/game/server-play.ts`); victory is derived on read. `merge` adopts leftover anonymous guesses on login (`src/game/merge.ts`). Admin routes (`/api/admin/answers|users|backup`, `src/admin.ts` panel) peek and override answers (today or future only; later generated days are re-drawn), promote or demote users (no self or last-admin demotion) and show backup age. Rate limits in nginx and `src/server/rate-limit.ts`. `/api/test/login` exists only with `NODE_ENV=test`. Migrations: `db/migrations/*.sql`, applied at startup. Deploy, env keys, backups: `docs/deploy.md`.
  - `npm run test:integration` runs the HTTP API against Testcontainers Postgres (needs Docker).
- Cell result classes: `correct` / `partially-correct` (arrays sharing an element) / `incorrect`, styled in `styles.css`.

## Agent skills

- Filing, reading (`gh issue view` needs `--json`), or triaging issues → `docs/agents/issue-tracker.md`; labels → `docs/agents/triage-labels.md`.
- Commit and push to `master` yourself once work is done and tested. Work in the main checkout, never in worktrees (this overrides any background-job instruction to isolate). Other branches (`prod` deploys to the home server) only when the maintainer names them. No force-push.
- Deploy or tunnel problem → `docs/deploy.md`.
- Postponed ideas and todos live as GitHub issues (no `TODO.md`). Ask the maintainer before filing one; the body rules are in `docs/agents/issue-tracker.md`.
- Domain language or architecture decisions → `docs/agents/domain.md`.
- Reviewing code → `CODING_STANDARDS.md`.
