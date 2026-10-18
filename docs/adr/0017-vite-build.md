# 0017: Vite builds the front-end

Status: accepted. Supersedes the esbuild parts of ADR 0004 and the build script of ADR 0007; first step of the React migration.

`vite build` replaces `scripts/build.mjs`, `scripts/build-prod.mjs` and `scripts/entries.mjs`. Every root `*.html` page (including `404.html`) is an input in `vite.config.ts`. A page links its sources directly (`/src/styles.css`, `/src/pages/<page>.ts`); Vite rewrites them to content-hashed files under `/dist/assets/` (`base: "/dist/"`) and writes the built page to `dist/<page>.html`. Images and the favicon a page links are hashed into `dist/assets/` too.

- `npm run build`: unminified with sourcemaps, for dev and e2e. `npm run build:prod`: minified, no sourcemaps. Both hash names, so dev and prod pages have the same shape.
- The dev server (`scripts/server.mjs`) serves the built pages from `dist/` and gives the API `shellDir: dist` for the `/g/<slug>` meta injection. Docker's build stage moves `dist/*.html` to the root as before, so nginx and the API image are unchanged.
- Shared modules are split into their own chunks with `modulepreload` links instead of being copied into each page bundle.

## Considered options

- Keep esbuild: already handles JSX, but no dev server or hot reload, and the hashing and HTML rewriting stay hand-written.
- Vite dev server for the multi-page site now: needs clean-URL rewrites for nine pages that the React single-page app replaces next; hot reload comes with that app instead.

## Consequences

- HTML and CSS edits now need a rebuild (`npm run watch`) like `.ts` edits, because the pages are served from `dist/`.
- `tests/build-wiring.test.ts` runs a real `vite build` into a temp folder to check hashed references and that no answer data reaches a bundle.
