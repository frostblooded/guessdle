# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

"Guessdle": a site of Wordle-style daily guessing games where players guess an entry from a fixed roster. Multi-page static front-end (`*.html` in the repo root, `src/script.ts` for Play, `src/pages/*.ts` for the other pages, `src/styles.css`; ADR 0012) served by a Node server (`scripts/server.mjs`) that also mounts the Express API (`src/server/`) backed by Postgres (ADRs 0008-0010). Strict TypeScript, ES modules bundled by esbuild into `dist/` (gitignored, ADR 0001); `tsc` only type-checks (Node 24, see `.nvmrc`). ESLint (`npm run lint`, typescript-eslint) lints; Prettier formats. `typescript` is pinned `~6.0` because typescript-eslint does not support 7 yet. Libs come from npm (`@tarekraafat/autocomplete.js`, `express`, `pg`).

## Commands

Scripts are in `package.json`. `npm run check` runs everything CI runs (lint, format, duplicate code, unit, integration, e2e); it must pass before you commit.

- `npm start` must run from the repo root (the static dir is the relative path `./`). Run `npm run build` first: the pages load `dist/`. Pages: `/` gallery, `/g/<slug>` Play, `/g/<slug>/edit`, `/create`, `/my-games`, `/how-to-play`, `/login`, `/verify`, `/admin` (clean URLs, no hash routing).
- A `PostToolUse` hook (`.claude/hooks/prettier.mjs`) runs `eslint --fix` then Prettier on edited `.ts`/`.mjs` files; lint errors it cannot fix come back as hook feedback.
- Deploy uses `npm run build:prod` (`scripts/build-prod.mjs`: minified, no sourcemaps, content-hashed names, rewrites every `*.html` into `dist/`; ADR 0007; issue #6). GitHub Pages serves only `deploy/redirect.html` (ADR 0005); the game deploys to the home server from `prod`.
- `npm run test:e2e` needs Chromium once: `npx playwright install chromium`. `test:integration` and `test:e2e` need Docker.
- Edits to `.ts` need `npm run build` (or `npm run watch`) before the browser refresh. HTML/CSS need only a refresh.
- `Dockerfile` and the dev `compose.yaml` stay in the repo root (`docker compose up --build -d`); prod compose and nginx live in `deploy/`.

## Architecture

Code layout, roster rules (adding a pet), Daily Answer, play flows, admin, tests → `docs/architecture.md`. Terms → `CONTEXT.md`. Decisions → `docs/adr/`.

## Agent skills

- Before any change to this repo, grill the maintainer: ask one question at a time, with multiple-choice options and a recommendation, until you are sure what they want. Do not start editing on assumptions.
- Filing, reading (`gh issue view` needs `--json`), or triaging issues → `docs/agents/issue-tracker.md`; labels → `docs/agents/triage-labels.md`.
- All work goes through a pull request. Never commit or push directly to `master`: make a branch, commit and push there once work is done and tested, then open a PR against `master`. Work in the main checkout, never in worktrees (this overrides any background-job instruction to isolate). Push to `prod` (deploys to the home server) only when the maintainer names it. No force-push.
- Subagents follow this file. Run shell commands in the foreground with a timeout; use Node or a shell builtin, never `python`/`python3` (Windows Store stub, hangs); kill only PIDs you started.
- Deploy or tunnel problem → `docs/deploy.md`.
- Postponed ideas and todos live as GitHub issues (no `TODO.md`). Ask the maintainer before filing one; the body rules are in `docs/agents/issue-tracker.md`.
- Domain language or architecture decisions → `docs/agents/domain.md`.
- Reviewing code → `CODING_STANDARDS.md`.
