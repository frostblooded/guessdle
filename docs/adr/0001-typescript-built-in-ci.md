# TypeScript is compiled in CI; compiled JS is not committed

The front-end is written in TypeScript (`script.ts`, strict mode). `tsc` emits `script.js` beside it, and `script.js` is gitignored. GitHub Pages deploys through a GitHub Actions workflow that runs the tests, compiles, assembles the static files and publishes them. Pages source must be set to "GitHub Actions".

## Considered options

- Commit compiled JS: keeps Pages deploying straight from `master` with no workflow, but duplicates every change in diffs and risks stale output.
- Push build output to a `gh-pages` branch: works, but adds a generated branch to maintain.

## Consequences

- Local development needs Node 24 (`.nvmrc`) and `npx tsc --watch` alongside `cargo run`, since the Rust server serves the repo root.
- The daily answer depends on roster order and RNG. Conversion must not change them. No automated test guards this yet.
