import { expect, test } from "@playwright/test";

const SERVED = [
  ["/", "text/html"],
  ["/index.html", "text/html"],
  ["/g/petdle", "text/html"],
  ["/game.html", "text/html"],
  ["/dist/gallery.js", "text/javascript"],
  ["/login", "text/html"],
  ["/verify", "text/html"],
  ["/admin", "text/html"],
  ["/how-to-play", "text/html"],
  ["/login.html", "text/html"],
  ["/dist/styles.css", "text/css"],
  ["/dist/script.js", "text/javascript"],
  ["/dist/script.css", "text/css"],
  ["/dist/script.js.map", "application/json"],
  ["/favicon.ico", "image/x-icon"],
  ["/howto/ati.jpg", "image/jpeg"],
] as const;

const NOT_SERVED = [
  "/missing.html",
  "/styles.css",
  "/src/styles.css",
  "/404.html",
  "/login/",
  "/Login",
  "/admin/x",
  "/g",
  "/g/",
  "/g/petdle/",
  "/g/a/b",
  "/how-to-play.htm",
  "/howto/missing.jpg",
  "/howto/",
  "/package.json",
  "/scripts/server.mjs",
  "/src/script.ts",
  "/src/game/game.ts",
  "/dist/",
  "/dist/../package.json",
  "/tests/e2e/server.spec.ts",
  "/docs/adr/0001-typescript-built-in-ci.md",
  "/.git/config",
  "/node_modules/typescript/package.json",
  "/howto/../package.json",
  "/howto/%2e%2e/package.json",
  "/howto/..%2fpackage.json",
  "/howto/%2e%2e%2fpackage.json",
  "/howto/%ZZ",
] as const;

for (const [path, type] of SERVED) {
  test(`${path} is served as ${type}`, async ({ request }) => {
    const response = await request.get(path);

    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain(type);
  });
}

for (const path of NOT_SERVED) {
  test(`${path} is a 404 with the not-found page`, async ({ request }) => {
    const response = await request.get(path);

    expect(response.status()).toBe(404);
    expect(response.headers()["content-type"]).toContain("text/html");
    expect(await response.text()).toContain("Back to GUESSDLE");
  });
}
