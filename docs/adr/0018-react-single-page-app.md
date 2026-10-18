# 0018: React single-page app

Status: accepted. Supersedes ADR 0012 (multi-page front-end) except its URLs, the `/admin` gate and the magic-link flow, which stay as they were. Builds on ADR 0017 (Vite).

The front-end is one React app. `index.html` is the only page: it holds the inline theme script (ADR 0006), the site-wide `<title>` and description, and `<div id="root">`; `src/main.tsx` mounts `src/App.tsx`.

- **Routing**: React Router (`BrowserRouter`), case-sensitive, same clean URLs as before: `/`, `/g/:slug`, `/g/:slug/edit`, `/create`, `/my-games`, `/how-to-play`, `/login`, `/verify`, `/admin`. Anything else, and any path with a trailing slash, renders the not-found page.
- **Real 404s**: the dev server (`ROUTES` in `scripts/server.mjs`) and nginx (`deploy/nginx.conf`) list the same routes and answer them with the shell and 200. Every other path gets the same shell with status 404, so crawlers and link checkers see a real 404 while people see the app's not-found page. `/index.html` itself is a 404 too. `/g/<slug>` is still answered by the API with the game's meta injected and 404 for unknown games (`src/server/routes/shell.ts`, which now replaces the shell's `<title>` and description).
- **Data**: TanStack Query for reads that pages share or refetch (the signed-in user as `["me"]`, the gallery, My games, admin lists, the game being played). Writes call `api()` (`src/manage-client.ts`) and update the query data or refetch.
- **UI**: Tailwind CSS v4 (`@tailwindcss/vite`) with shadcn/ui-style components in `src/components/ui/` (Radix primitives from `radix-ui`, `class-variance-authority`, `tailwind-merge`). Design tokens live in `src/styles.css` as `light-dark()` hex values, so the theme button still only flips `color-scheme` and the e2e contrast checks still read plain `rgb()`.
- **Guess box**: a Downshift `useCombobox` (`src/routes/play/guess-box.tsx`) replaces `@tarekraafat/autocomplete.js`. Picking a name only fills the box; Enter with nothing highlighted submits. The box sets its text from the input's own change event, because Downshift reports changes after the render and fast typing lost keys.
- **Reset dialog**: Radix AlertDialog (focus on Cancel, Escape cancels, focus returns to the button that opened it).
- **Images**: the How to play photos are imported by the page, so Vite hashes them; `/howto/` is no longer served.
- **Tests**: Vitest has a `ui` project (jsdom, Testing Library) for components in `tests/ui/`. The Playwright e2e suite keeps its ids and roles, so it tests the same behavior as before.

## Considered options

- Keep the multi-page site and render React per page: no shared state between pages, and every page still needs its own entry and HTML file.
- SPA with an index.html fallback for every path: simplest server config, but no real 404 status.
- CSS Modules instead of Tailwind: closer to the old stylesheet, but the shadcn/ui components are written for Tailwind.

## Consequences

- Adding a page: a route in `src/App.tsx`, the path in `ROUTES` (`scripts/server.mjs`) and in `deploy/nginx.conf`, a reserved slug if it is top-level (`src/game/slug.ts`; `tests/limits.test.ts` checks), and `tests/e2e/server.spec.ts`.
- `npm run dev` runs the Vite dev server with hot reload and proxies `/api` and `/uploads` to `npm start` on 8080.
- One bundle for every page (about 155 kB gzipped). Routes can be split with `React.lazy` if that grows.
