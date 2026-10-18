# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

"Guessdle": a site of Wordle-style daily guessing games where players guess an entry from a fixed roster. React single-page app (`index.html` → `src/main.tsx` → `src/App.tsx`, routes in `src/routes/`, shared components in `src/components/`; React Router, TanStack Query, Tailwind CSS v4 with shadcn/ui components on Radix, Downshift for the guess box; ADR 0018) served by a Node server (`scripts/server.mjs`) that also mounts the Express API (`src/server/`) backed by Postgres (ADRs 0008-0010). Strict TypeScript, ES modules built by Vite into `dist/` (gitignored, ADR 0017); `tsc` only type-checks (Node 24, see `.nvmrc`). ESLint (`npm run lint`, typescript-eslint, react-hooks) lints; Prettier formats. `typescript` is pinned `~6.0` because typescript-eslint does not support 7 yet. Libs come from npm.

## Commands

Scripts are in `package.json`. `npm run check` runs everything CI runs (lint, format, duplicate code, unit, integration, e2e); it must pass before you commit.

- `npm start` must run from the repo root (the static dir is the relative path `./`). Run `npm run build` first: the app is served from `dist/`. Routes (also listed in `ROUTES` in `scripts/server.mjs` and in `deploy/nginx.conf`; anything else is a 404): `/` gallery, `/g/<slug>` Play, `/g/<slug>/edit`, `/g/<slug>/days`, `/g/<slug>/day/<n>`, `/create`, `/my-games`, `/settings`, `/how-to-play`, `/login`, `/verify`, `/admin`, `/party` and `/party/<CODE>` (clean URLs, no hash routing). `npm run dev` is the Vite dev server with hot reload, proxying `/api` to `npm start`.
- A `PostToolUse` hook (`.claude/hooks/prettier.mjs`) runs `eslint --fix` then Prettier on edited `.ts`/`.tsx`/`.mjs` files; lint errors it cannot fix come back as hook feedback.
- Deploy uses `npm run build:prod` (`vite build`: minified, no sourcemaps, content-hashed assets in `dist/assets/`, the built shell in `dist/index.html`; ADR 0017). `npm run build` is the same unminified with sourcemaps; the dev server serves the pages from `dist/`. GitHub Pages serves only `deploy/redirect.html` (ADR 0005); the game deploys to the home server from `prod`.
- `npm run test:e2e` needs Chromium once: `npx playwright install chromium`. `test:integration` and `test:e2e` need Docker.
- Edits to `.ts`/`.tsx`, `index.html` or CSS need `npm run build` (or `npm run watch`) before the browser refresh, since `npm start` serves `dist/`; `npm run dev` reloads on its own.
- `npm run storybook` opens Storybook on port 6006 (stories are `src/**/*.stories.tsx`; theme in the toolbar); `npm run build-storybook` builds it into `storybook-static/` (gitignored).
- `Dockerfile` and the dev `compose.yaml` stay in the repo root (`docker compose up --build -d`); prod compose and nginx live in `deploy/`.

## Architecture

Code layout, roster rules (adding a pet), Daily Answer, play flows, admin, tests → `docs/architecture.md`. Terms → `GLOSSARY.md`. Decisions → `docs/adr/`.

## Working rules

The maintainer's standing rules live here. Keep project settings and agent memory pointing at this file instead of copying them.

- Before any change to this repo, grill the maintainer with the `grilling` skill (rounds of numbered questions, each with options and a recommendation) until you are sure what they want. Do not start editing on assumptions.
- Write tests for most features; ask the maintainer when unsure whether a change needs them.
- All work goes through a pull request. Never commit or push directly to `master`: make a branch, commit and push there once work is done and tested, then open a PR against `master`. Work in the main checkout, never in worktrees (this overrides any background-job instruction to isolate); the one exception is `/implement-spec`, whose subagents may each use a worktree. No force-push.
- When a PR is done (CI green, review comments handled), merge it into `master` yourself without waiting to be asked.
- After merging a PR, open a GitHub issue labelled `manual-test` (create the label if missing) titled "Manually test: <PR title>", linking the PR with short steps to try the change on the site, assigned to `frostblooded`. This is the one kind of issue you file without asking.
- Push to `prod` (deploys to the home server) only when the maintainer asks for it.
- Postponed ideas and todos live as GitHub issues (no `TODO.md`). Ask the maintainer before filing one; the body rules are in `docs/agents/issue-tracker.md`.
- Subagents follow this file. Run shell commands in the foreground with a timeout; use Node or a shell builtin, never `python`/`python3` (Windows Store stub, hangs); kill only PIDs you started.

## Where to look

- Skills → `.claude/skills/` (Matt Pocock's, copied unedited; source, version and how to update in `.claude/skills/README.md`). `/ask-matt` says which one fits. Where a skill and this file disagree, this file wins.
- Filing, reading (`gh issue view` needs `--json`), or triaging issues → `docs/agents/issue-tracker.md`; labels → `docs/agents/triage-labels.md`.
- Deploy or tunnel problem → `docs/deploy.md`.
- Domain language or architecture decisions → `docs/agents/domain.md`.
- Reviewing code → `CODING_STANDARDS.md`.
