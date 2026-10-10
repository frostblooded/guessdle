# TODO

Postponed improvements. Add items here only after asking the maintainer.

## TypeScript follow-ups

- Split `script.ts` into ES modules (data, game logic, DOM). Needs the vendored libs wrapped or installed from npm.
- Bundle and minify with esbuild into a single file.
- Emit to `dist/` and serve that, instead of in-place `script.js`. Touches `src/main.rs`.
- Replace the hand-written `globals.d.ts` with `@types` packages matched to the vendored lib versions.
- Add ESLint with `typescript-eslint`, enforcing explicit types (`@typescript-eslint/typedef`) and the early-return style (return on its own line, no braces).
- Add Prettier (2-space config) for autoformatting. Keep ESLint formatting rules off to avoid conflicts; ESLint still enforces the early-return style.
