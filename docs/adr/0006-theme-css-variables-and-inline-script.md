# Theme: CSS variables, `data-theme`, and an inline head script

Light, dark and auto (follow the OS) are one palette of CSS custom properties in `styles.css`. Dark values are set by `@media (prefers-color-scheme: dark)` on `:root:not([data-theme="light"])` and by `:root[data-theme="dark"]`. The choice lives in `localStorage` under `theme` (`theme.ts`), separate from Game State, which resets daily. A button cycles auto, light, dark.

A small inline script in `index.html` copies a stored `light`/`dark` to `data-theme` before first paint.

## Considered options

- Set `data-theme` only from the bundled module: module scripts defer, so stored-dark players flash light.
- OS-only `prefers-color-scheme`: smallest, but no manual override.

## Consequences

- The "stored value is `light` or `dark`" rule exists twice: in `theme.ts` and in the inline script. An e2e test covers the inline path.
- The dark palette is written twice in the CSS (media query and `[data-theme="dark"]`); CSS cannot share it.
- The autocomplete.js stylesheet is overridden with a `body`-prefixed selector, since it loads after `styles.css`.
