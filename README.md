# Petdle

[![code style: prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg?style=flat-square)](https://github.com/prettier/prettier)

A Wordle-style daily guessing game. Guess the pet of the day from a fixed roster. Each guess is graded per attribute (colors, owners) as correct, partially correct, or incorrect. Everyone gets the same pet on the same date.

## How it works

- Multi-page static front-end: `index.html` (Play, `/`), `how-to-play.html`, `login.html`, `verify.html` (the emailed link lands here) and `admin.html`, each with a small entry in `src/` (`script.ts`, `src/pages/*.ts`), bundled by esbuild into `dist/` with one shared `src/styles.css`. Header and footer come from `src/shell.ts` (ADR 0012).
- Express API (`src/server/`) on Postgres. The daily answer is drawn at random on first request and stored per day, graded server-side and never sent to the browser until a win or give-up (ADRs 0008-0010).
- Anonymous progress is kept in `localStorage`; signing in with an emailed link stores it on the server. Both reset each day.
- `scripts/server.mjs` serves the static files and mounts the API for local development (needs Postgres, see `docs/deploy.md`).

## Requirements

- Node 24 (see `.nvmrc`)

## Run locally

```sh
npm install
npm run build    # bundle to dist/ (or: npm run watch)
npm run build:prod # minified, no sourcemaps (deploy)
npm start
```

Open <http://127.0.0.1:8080> (set `PORT` to change it). Pages: `/` Play, `/how-to-play`, `/login` (sign in and sign up are one passwordless form), `/admin` (admins only). With `docker compose up -d --build` the sign-in mail lands in Mailpit at <http://localhost:8025>. Run `npm start` from the repo root: it serves `./`.

After editing a `.ts` file, rebuild before refreshing (`npm run typecheck` runs `tsc`). HTML and CSS edits need only a refresh.

## Docker

```sh
docker compose up --watch  # dev: live rebuild, http://localhost:8080
docker build -t petdle .   # prod image (nginx, non-root)
docker run -p 8080:8080 petdle
```

`scripts/server.mjs` binds all interfaces (needed inside the container), so `npm start` is reachable from your LAN too.

### Home server

The server's existing Cloudflare Tunnel (service `http://guessdle-server:8080`) must share a Docker network with the container; see `deploy/compose.prod.yaml`. On the server:

```sh
./deploy/start.sh  # git pull, then docker compose up -d --build
```

`--build` rebuilds the image from the pulled source before starting, so the container runs the new code. Without it compose reuses the old image. `-d` runs detached; the container restarts on reboot (`unless-stopped`).

## Adding a pet

Entries and photos live in the database; photos are uploads (`POST /api/uploads`). The original `photos/*.jpg` were moved there once with `scripts/import-photos.mjs` (issue #71; restore the folder from git history before that commit to rerun it).

## Deployment

GitHub Actions (`.github/workflows`) deploys the game to the home server on push to `prod`. GitHub Pages (push to `master`) only serves `deploy/redirect.html`, which sends visitors to the home server (ADR 0005).

## License

All rights reserved. See [`LICENSE`](LICENSE).

## More docs

- [`CONTEXT.md`](CONTEXT.md): domain terms
- [`docs/adr/`](docs/adr): architecture decisions
- [`CLAUDE.md`](CLAUDE.md): guidance for AI coding agents
