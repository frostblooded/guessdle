# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

"Petdle": a Wordle-style daily guessing game where players guess a pet from a fixed roster. Static front-end (`index.html`, `script.ts` compiled to `script.js`, `styles.css`) served by a tiny Rust actix-web server (crate name `guessdl_server`). Strict TypeScript compiled with `tsc` (Node 24, see `.nvmrc`). No bundler, no linter. `script.js` is gitignored (ADR 0001).

## Commands

Scripts are in `package.json`.

- `cargo run` / `npm start` must run from the repo root (the static dir is the relative path `./`).
- `npm test` compiles, type-checks and runs unit tests (`tests/*.test.ts`). `npm run test:e2e` runs Playwright (`tests/e2e/`).
- Golden fixture `tests/fixtures/answer-sequence.golden.json`: regenerate only deliberately (ADR 0002).
- `npm run test:e2e` needs Chromium once: `npx playwright install chromium`.
- Edits to `.ts` need `npx tsc` (or `npx tsc --watch`) before the browser refresh. HTML/CSS need only a refresh.

## Architecture

- `src/main.rs` only serves static files. All game logic is client-side.
- Local scripts are global scripts (no ES modules), compiled beside themselves and loaded in the order of the `<script>` tags in `index.html`. The pure ones (`answer-sequence`, `game-state`, `correctness`) are unit-tested by loading the compiled `.js` in `node:vm` (`tests/helpers/load-game.ts`, ADR 0003). `script.ts` holds the DOM logic. `globals.d.ts` types the vendored libs.
  - `GUESS_DATA` (in `roster.ts`) is the pet roster (`photo`, `name`, `colors[]`, `owners[]`). Adding a pet = add photo to `photos/` and an entry here; the `Pet` interface makes a missing or misspelled attribute a compile error. The key order of each entry drives table column order in `addGuessResultElement` (iterates `for key in resultData`), and must match the column headers in `index.html`. Adding a new field needs a header in `index.html` and handling in `gradeCorrectness` (supports only strings and arrays).
  - Daily answer is deterministic with no backend: `generateAnswerIdx` seeds `Math.seedrandom` with `ANSWER_START_DATE` (2025-08-15), not today, then `generateAnswerSequence` replays every day from the start date to today, drawing each day's answer uniformly from the roster minus the previous `ANSWER_SKIP_PERIOD` answers (ADR 0002). Consequence: changing `GUESS_DATA` (order or length), `ANSWER_START_DATE`, or the skip logic changes the answers for all days, including today's.
  - `createGameState(storage, now)` (`game-state.ts`) owns the `localStorage` state; a missing or other-day `lastPlayed` clears guesses and victory.
  - Autocomplete uses vendored `libs/autoComplete`; RNG uses vendored `libs/seedrandom`. Both are loaded via plain `<script>` tags, no modules.
- Cell result classes: `correct` / `partially-correct` (arrays sharing an element) / `incorrect`, styled in `styles.css`.

## Agent skills

- Filing, reading (`gh issue view` needs `--json`), or triaging issues → `docs/agents/issue-tracker.md`; labels → `docs/agents/triage-labels.md`.
- Commit and push straight to `master`; no branches or PRs needed.
- Postponed ideas and todos live as GitHub issues (no `TODO.md`). Ask the maintainer before filing one.
- Domain language or architecture decisions → `docs/agents/domain.md`.
- Reviewing code → `CODING_STANDARDS.md`.
