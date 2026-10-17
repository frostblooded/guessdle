import { defineConfig } from "vite";

// Every page is its own HTML entry (ADR 0012). Built pages land in dist/ next to their hashed
// assets in dist/assets/; the dev server and Docker serve the pages from there (ADR 0016).
const PAGES = [
  "index",
  "game",
  "login",
  "verify",
  "admin",
  "how-to-play",
  "create",
  "my-games",
  "edit",
  "404",
];

export default defineConfig({
  base: "/dist/",
  publicDir: false,
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2020",
    rolldownOptions: {
      input: Object.fromEntries(PAGES.map((page) => [page, `${page}.html`])),
    },
  },
});
