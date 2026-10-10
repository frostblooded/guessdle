# TODO

Postponed improvements. Add items here only after asking the maintainer.

## TypeScript follow-ups

- Split `script.ts` into ES modules (data, game logic, DOM). Needs the vendored libs wrapped or installed from npm.
- Bundle and minify with esbuild into a single file.
- Emit to `dist/` and serve that, instead of in-place `script.js`. Touches `src/main.rs`.
- Replace the hand-written `globals.d.ts` with `@types` packages matched to the vendored lib versions.
- Add ESLint with `typescript-eslint`, enforcing explicit types (`@typescript-eslint/typedef`) and the early-return style (return on its own line, no braces; e.g. `curly` plus `nonblock-statement-body-position`). Add a `lint` script to `package.json` and a lint step in the CI workflow next to `npx tsc`, so the reviewer agent and CI catch violations instead of memory notes.
- Add Prettier (2-space config) for autoformatting. Keep ESLint formatting rules off to avoid conflicts; ESLint still enforces the early-return style. Add a `format:check` script and a CI step.

## Testing

- Add tests: unit tests for game logic (daily answer, skip period, result cell classes, localStorage state) and e2e tests for the guess flow, including edge cases and clear error states. Needs a test runner; game logic in `script.ts` is a global script, so extraction or a DOM-env harness is required. Do this early: it is the seam that lets `/tdd` work. Add a `test` script to `package.json` and a CI test job.
