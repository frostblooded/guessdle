# ES modules, bundled with esbuild

Supersedes ADR 0003 and the "no bundler" part of ADR 0001. Source is split into ES modules (`roster`, `answer-sequence`, `correctness`, `game-state`, `script`). `esbuild` bundles `script.ts` (with CSS) into `dist/`, which is gitignored and deployed. `tsc` only type-checks. `seedrandom` and `@tarekraafat/autocomplete.js` are npm dependencies; both ship only CJS/UMD builds, which browsers cannot import natively, hence the bundler. Unit tests import the `.ts` modules directly (Node 24 type stripping); no `node:vm` loader.

## Considered options

- Keep the libs as vendored global `<script>` tags: no bundler, but modules would still read globals and `libs/` stays hand-maintained.
- Wrap the vendored files as ESM by hand: diverges from upstream.
- esbuild (chosen): standard npm flow, one script tag, no vendored code.

## Consequences

- Modules must use erasable TypeScript syntax only (no `enum`, namespaces, parameter properties) and `.ts` import extensions.
- `npm run build` is needed before `npm start` or e2e; `npm run test:e2e` runs it.
- Modules that build a `Date` at import time (`ANSWER_START_DATE`) need the timezone set before import in tests (dynamic import).
- Deploy uses `npm run build:prod` (minified, no sourcemaps); dev and e2e use `npm run build` (sourcemaps, unminified).
