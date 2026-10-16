# 0012: Multi-page front-end with clean URLs

The front-end was one page with the sign-in form, an admin dialog and a help dialog layered on the game. It is now a small site: real paths, no hash routing.

| Path           | File               | Entry bundle               |
| -------------- | ------------------ | -------------------------- |
| `/`            | `index.html`       | `src/script.ts`            |
| `/how-to-play` | `how-to-play.html` | `src/pages/how-to-play.ts` |
| `/login`       | `login.html`       | `src/pages/login.ts`       |
| `/verify`      | `verify.html`      | `src/pages/verify.ts`      |
| `/admin`       | `admin.html`       | `src/pages/admin.ts`       |

- **Build**: one esbuild entry per page plus `src/styles.css` as its own entry (`scripts/entries.mjs`, used by `scripts/build.mjs` and `scripts/build-prod.mjs`). Pages link `/dist/styles.css` and `/dist/<page>.js`; the prod build hashes every output and rewrites all root `*.html` files, `404.html` included. Bundles are not code-split: each page carries its few shared modules, and only Play and Admin carry the roster. The Daily Answer still never reaches a bundle (checked by `tests/build-wiring.test.ts`).
- **Shared chrome**: `src/shell.ts` renders header and footer into empty `<header id="site-header">` / `<footer id="site-footer">` elements and resolves to the signed-in user. One source of markup instead of five copies; the cost is a short layout reserve before JS runs, and the pages need JS anyway.
- **Serving**: `scripts/server.mjs` maps `/login` to `login.html` and so on (allowlist, ADR 0001 style); nginx uses `try_files $uri $uri/index.html $uri.html =404`. Unknown paths get the static `404.html`. Trailing slashes are not special-cased.
- **Admin access**: `/admin` is a static page. It asks `/api/me` and shows a sign-in prompt or a 403 notice instead of the tabs for non-admins. This is presentation only: every `/api/admin/*` route still checks the admin flag (CODING_STANDARDS.md).
- **Magic link**: `${PUBLIC_URL}/verify?token=...` (ADR 0011). `/verify` sends `<meta name="referrer" content="no-referrer">`, removes the token from the address bar once spent, then goes to `/`, where the anonymous-guess merge runs as before.
- **Theme**: tokens are `light-dark()` values (ADR 0006 updated); needs a 2024-or-newer browser.

## Considered options

- Keep one page and add client-side hash or history routing: needs a router, and nginx/dev server fallbacks to `index.html`, with no real 404s.
- A framework or static-site generator for shared layout: a new dependency for five small pages.
- Copy the header and footer into every HTML file: simple, but five places to edit; a unit test would have to guard drift.

## Consequences

- Adding a page means: an HTML file, an entry in `scripts/entries.mjs`, a line in the dev server's `PAGES`, and (for tests) `tests/build-wiring.test.ts` and `tests/e2e/server.spec.ts`; nginx needs nothing.
- The old `/?login=` links are no longer handled; they expire after 15 minutes anyway.
