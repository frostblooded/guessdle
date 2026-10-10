# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

"Petdle": a Wordle-style daily guessing game where players guess a pet from a fixed roster. Static front-end (`index.html`, `script.ts` compiled to `script.js`, `styles.css`) served by a tiny Rust actix-web server (crate name `guessdl_server`). Strict TypeScript compiled with `tsc` (Node 24, see `.nvmrc`). No bundler, no tests, no linter. `script.js` is gitignored (ADR 0001).

## Commands

- Run: `cargo run` (or `npm start`) — serves the repo root (`./`) on `0.0.0.0:8080`. Must be run from the repo root since the static dir is the relative path `./`.
- Build: `cargo build`
- Install: `npm install` (once). Compile: `npx tsc`, or `npx tsc --watch` next to `cargo run`.
- Edits to `script.ts` need a recompile to `script.js` before the browser refresh. HTML/CSS need only a refresh.

## Architecture

- `src/main.rs`: only serves static files from the working directory (`index.html` as index). All game logic is client-side.
- `script.ts` (compiled to `script.js`): all game logic. `globals.d.ts` types the vendored libs. Stays a global script: no ES modules.
  - `GUESS_DATA` is the pet roster (`photo`, `name`, `colors[]`, `owners[]`). Adding a pet = add photo to `photos/` and an entry here; the `Pet` interface makes a missing or misspelled attribute a compile error. The key order of each entry drives table column order in `addGuessResultElement` (iterates `for key in resultData`), and must match the column headers in `index.html`. Adding a new field needs a header in `index.html` and handling in `addGuessResultCellClasses` (supports only strings and arrays).
  - Daily answer is deterministic with no backend: `Math.seedrandom(dateString)` is seeded on load, then `generateAnswerIdx` replays every day from `START_DATE` (2025-08-15) to today, picking each day's answer and skipping the previous `ANSWER_SKIP_PERIOD` answers. Consequence: changing `GUESS_DATA` (order or length), `START_DATE`, or the skip logic changes the answers for all days, including today's.
  - State lives in `localStorage` (`usedGuesses`, `victory`, `lastPlayed`). `initGame` clears guesses and victory when `lastPlayed` is a different day.
  - Autocomplete uses vendored `libs/autoComplete`; RNG uses vendored `libs/seedrandom`. Both are loaded via plain `<script>` tags, no modules.
- Cell result classes: `correct` / `partially-correct` (arrays sharing an element) / `incorrect`, styled in `styles.css`.

## Agent skills

- Filing, reading, or triaging issues → `docs/agents/issue-tracker.md`; labels → `docs/agents/triage-labels.md`.
- Domain language or architecture decisions → `docs/agents/domain.md`.
