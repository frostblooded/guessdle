# Petdle

A Wordle-style daily guessing game. Guess the pet of the day from a fixed roster. Each guess is graded per attribute (colors, owners) as correct, partially correct, or incorrect. Everyone gets the same pet on the same date.

## How it works

- Static front-end: `index.html`, `script.ts` (compiled to `script.js`), `styles.css`.
- No backend. The daily answer is derived from the date with a seeded RNG, so every player sees the same pet.
- Progress is kept in `localStorage` and resets each day.
- A small Node server (`server.mjs`) serves the static files for local development.

## Requirements

- Node 24 (see `.nvmrc`)

## Run locally

```sh
npm install
npx tsc          # compile script.ts to script.js (or: npx tsc --watch)
npm start
```

Open <http://127.0.0.1:8080> (set `PORT` to change it). Run `npm start` from the repo root: it serves `./`.

After editing `script.ts`, recompile before refreshing. HTML and CSS edits need only a refresh.

## Adding a pet

1. Add the photo to `photos/`.
2. Add an entry to `GUESS_DATA` in `script.ts`.

Warning: changing `GUESS_DATA` (order or length), `START_DATE`, or the skip logic changes the answer for every day, including today.

## Deployment

GitHub Actions (`.github/workflows`) compiles TypeScript and deploys the static files to GitHub Pages on push to `master`.

## License

All rights reserved. See [`LICENSE`](LICENSE).

## More docs

- [`CONTEXT.md`](CONTEXT.md): domain terms
- [`docs/adr/`](docs/adr): architecture decisions
- [`CLAUDE.md`](CLAUDE.md): guidance for AI coding agents
