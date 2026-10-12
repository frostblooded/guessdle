# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

"Petdle": a Wordle-style daily guessing game where players guess a pet from a fixed roster. Static front-end (`index.html`, `script.ts`, `styles.css`) served by a tiny Node server (`server.mjs`). Strict TypeScript, ES modules bundled by esbuild into `dist/` (gitignored, ADR 0001); `tsc` only type-checks (Node 24, see `.nvmrc`). ESLint (`npm run lint`, typescript-eslint) lints; Prettier formats. `typescript` is pinned `~6.0` because typescript-eslint does not support 7 yet. Libs come from npm (`seedrandom`, `@tarekraafat/autocomplete.js`).

## Commands

Scripts are in `package.json`.

- `npm start` must run from the repo root (the static dir is the relative path `./`). Run `npm run build` first: `index.html` loads `dist/`.
- `npm run lint` runs ESLint (CI runs it too).
- `npm run format` runs Prettier; `npm run format:check` is the CI check. A `PostToolUse` hook (`.claude/hooks/prettier.mjs`) formats files after Edit/Write.
- `npm test` type-checks and runs unit tests (`tests/*.test.ts`). `npm run test:e2e` runs Playwright (`tests/e2e/`).
- Golden fixture `tests/fixtures/answer-sequence.golden.json`: regenerate only deliberately (ADR 0002).
- `npm run test:e2e` needs Chromium once: `npx playwright install chromium`.
- Edits to `.ts` need `npm run build` (or `npm run watch`) before the browser refresh. `npm run typecheck` runs `tsc`. HTML/CSS need only a refresh.

## Architecture

- `server.mjs` only serves static files. All game logic is client-side.
- Source files are ES modules (imports use `.ts` extensions) bundled from `script.ts` into `dist/script.js` + `dist/script.css`. The pure ones (`answer-sequence`, `date`, `game`, `game-state`, `correctness`, `roster`) are unit-tested by importing the `.ts` directly under Node's type stripping, so keep them erasable-syntax only (no `enum`) (ADR 0004). `game.ts` holds the pure game flow (Daily Answer pick, guess judging); `script.ts` holds the DOM logic. `autocomplete.d.ts` types autoComplete.
  - `GUESS_DATA` (in `roster.ts`) is the pet roster (`photo`, `name`, `colors[]`, `owners[]`). Adding a pet = add photo to `photos/` and an entry here; the `Pet` interface makes a missing or misspelled attribute a compile error. The key order of each entry drives table column order in `addGuessResultElement` (iterates `for key in resultData`), and must match the column headers in `index.html`. Adding a new field needs a header in `index.html` and handling in `gradeCorrectness` (supports only strings and arrays).
  - Daily answer is deterministic with no backend: `generateAnswerIdx` seeds `seedrandom` with `ANSWER_START_DATE` (2025-08-15), not today, then `generateAnswerSequence` replays every day from the start date to today, drawing each day's answer uniformly from the roster minus the previous `ANSWER_SKIP_PERIOD` answers (ADR 0002). Consequence: changing `GUESS_DATA` (order or length), `ANSWER_START_DATE`, or the skip logic changes the answers for all days, including today's.
  - `createGameState(storage, now)` (`game-state.ts`) owns the `localStorage` state; a missing or other-day `lastPlayed` clears guesses and victory.
  - Autocomplete uses `@tarekraafat/autocomplete.js`; RNG uses `seedrandom`. Both npm, bundled.
- Cell result classes: `correct` / `partially-correct` (arrays sharing an element) / `incorrect`, styled in `styles.css`.

## Agent skills

- Filing, reading (`gh issue view` needs `--json`), or triaging issues → `docs/agents/issue-tracker.md`; labels → `docs/agents/triage-labels.md`.
- Commit and push straight to `master`; no branches or PRs needed.
- Postponed ideas and todos live as GitHub issues (no `TODO.md`). Ask the maintainer before filing one.
- Domain language or architecture decisions → `docs/agents/domain.md`.
- Reviewing code → `CODING_STANDARDS.md`.
