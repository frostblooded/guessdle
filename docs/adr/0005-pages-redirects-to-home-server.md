# GitHub Pages only redirects to the home server

Update 2026-10-20: the Pages deploy job and `deploy/redirect.html` are gone from the repo. The last Pages deployment (this redirect page) stays up as it is, and nothing deploys to Pages again.

Supersedes the Pages-hosting part of ADR 0001. The game is served from `https://guessdle.niki.casa/` (deployed from `prod`). The old Pages site stays alive but ships only `deploy/redirect.html` as `index.html` and `404.html`: meta refresh, `location.replace` fallback and a visible link, always to the home server root (no path or query forwarding; Pages only ever sees the old root URL, and the game's own routes, ADR 0012, exist on the home server only).

## Considered options

- Redirect from `script.ts` while still serving the game: needs JS and keeps the bundle deployed to a dead host.
- Delete the Pages deploy and disable Pages: old links would 404.
- Static redirect page (chosen): works without JS, no game code touched.

## Consequences

- `localStorage` is per-origin, so players lose the current day's guesses on the move. Accepted, no migration (state resets daily).
- The Pages `build` job no longer bundles; `unit`, `docker` and `e2e` still build and gate the deploy.
- The target URL is hard-coded in `deploy/redirect.html`; changing hosts means editing that file.
