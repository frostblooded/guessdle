# 0007: Hashed bundle names in prod

Cloudflare edge-caches `.css`/`.js` for hours, so a deploy served new HTML with a stale `styles.css`. `npm run build:prod` (`build-prod.mjs`) now names the bundle `dist/script-<hash>.js` and `.css` and writes `dist/index.html` pointing at them. `styles.css` is imported by `script.ts`, so it is part of the hashed bundle (`404.html` still links the plain `/styles.css`). nginx sends `Cache-Control: immutable` for `/dist/` and `no-cache` for everything else. Dev (`npm run build`) keeps plain names, and `index.html` in the repo references them.
