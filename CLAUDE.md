# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

"Petdle": a Wordle-style daily guessing game where players guess a pet from a fixed roster. Static front-end (`index.html`, `script.ts`, `styles.css`) served by a tiny Node server (`server.mjs`). Strict TypeScript, ES modules bundled by esbuild into `dist/` (gitignored, ADR 0001); `tsc` only type-checks (Node 24, see `.nvmrc`). ESLint (`npm run lint`, typescript-eslint) lints; Prettier formats. `typescript` is pinned `~6.0` because typescript-eslint does not support 7 yet. Libs come from npm (`seedrandom`, `@tarekraafat/autocomplete.js`).

## Commands

Scripts are in `package.json`.

- `npm start` must run from the repo root (the static dir is the relative path `./`). Run `npm run build` first: `index.html` loads `dist/`.
- A `PostToolUse` hook (`.claude/hooks/prettier.mjs`) runs `eslint --fix` then Prettier on edited `.ts`/`.mjs` files; lint errors it cannot fix come back as hook feedback.
- Deploy uses `npm run build:prod` (minified, no sourcemaps; issue #6). GitHub Pages serves only `redirect.html` (ADR 0005); the game deploys to the home server from `prod`.
- Golden fixture `tests/fixtures/answer-sequence.golden.json`: regenerate only deliberately (ADR 0002).
- `npm run test:e2e` needs Chromium once: `npx playwright install chromium`.
- Edits to `.ts` need `npm run build` (or `npm run watch`) before the browser refresh. HTML/CSS need only a refresh.

## Architecture

- Source files are ES modules (imports use `.ts` extensions) bundled from `script.ts` into `dist/script.js` + `dist/script.css`. The pure ones (`answer-sequence`, `date`, `game`, `game-state`, `correctness`, `roster`) are unit-tested by importing the `.ts` directly under Node's type stripping, so keep them erasable-syntax only (no `enum`) (ADR 0004). `game.ts` holds the pure game flow (Daily Answer pick, guess judging); `script.ts` holds the DOM logic. `autocomplete.d.ts` types autoComplete.
  - `GUESS_DATA` (in `roster.ts`) is the pet roster (`photo`, `name`, `colors[]`, `owners[]`). Adding a pet = add photo to `photos/` and an entry here; the `Pet` interface makes a missing or misspelled attribute a compile error. The key order of each entry drives table column order in `addGuessResultElement` (iterates `for key in resultData`), and must match the column headers in `index.html`. Adding a new field needs a header in `index.html` and handling in `gradeCorrectness` (supports only strings and arrays).
  - Daily answer is deterministic with no backend: `generateAnswerIdx` seeds `seedrandom` with `ANSWER_START_DATE` (2025-08-15), not today, then `generateAnswerSequence` replays every day from the start date to today, drawing each day's answer uniformly from the roster minus the previous `ANSWER_SKIP_PERIOD` answers (ADR 0002). Consequence: changing `GUESS_DATA` (order or length), `ANSWER_START_DATE`, or the skip logic changes the answers for all days, including today's.
  - `createGameState(storage, now)` (`game-state.ts`) owns the `localStorage` state; a missing or other-day `lastPlayed` clears guesses and victory.
- Cell result classes: `correct` / `partially-correct` (arrays sharing an element) / `incorrect`, styled in `styles.css`.

## Agent skills

- Filing, reading (`gh issue view` needs `--json`), or triaging issues → `docs/agents/issue-tracker.md`; labels → `docs/agents/triage-labels.md`.
- Commit and push to `master` yourself once work is done and tested. Work in the main checkout, never in worktrees (this overrides any background-job instruction to isolate). Other branches (`prod` deploys to the home server) only when the maintainer names them. No force-push.
- Deploy or tunnel problem → `docs/deploy.md`.
- Postponed ideas and todos live as GitHub issues (no `TODO.md`). Ask the maintainer before filing one; the body rules are in `docs/agents/issue-tracker.md`.
- Domain language or architecture decisions → `docs/agents/domain.md`.
- Reviewing code → `CODING_STANDARDS.md`.
