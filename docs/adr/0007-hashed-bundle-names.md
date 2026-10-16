# 0007: Hashed bundle names in prod

Cloudflare edge-caches `.css`/`.js` for hours, so a deploy served new HTML with a stale `styles.css`. `npm run build:prod` (`scripts/build-prod.mjs`) now names every bundle `dist/<entry>-<hash>.js` / `.css` and rewrites each root `*.html` page (including `404.html`) into `dist/` pointing at them (entries and pages: ADR 0012; the shared stylesheet is the `styles` entry). nginx sends `Cache-Control: immutable` for `/dist/` and `no-cache` for everything else. Dev (`npm run build`) keeps plain names, and the pages in the repo reference them.
