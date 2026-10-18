import { expect, test } from "@playwright/test";

const SERVED = [
  ["/", "text/html"],
  ["/g/petdle", "text/html"],
  ["/g/petdle/edit", "text/html"],
  ["/g/petdle/days", "text/html"],
  ["/g/petdle/day/0", "text/html"],
  ["/login", "text/html"],
  ["/verify", "text/html"],
  ["/admin", "text/html"],
  ["/how-to-play", "text/html"],
  ["/create", "text/html"],
  ["/my-games", "text/html"],
  ["/party", "text/html"],
  ["/party/ABCD", "text/html"],
  ["/favicon.ico", "image/x-icon"],
] as const;

const NOT_SERVED = [
  "/index.html",
  "/game.html",
  "/login.html",
  "/missing.html",
  "/howto/ati.jpg",
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
  "/g/petdle/day/x",
  "/g/petdle/day/",
  "/how-to-play.htm",
  "/party/",
  "/party/AB1",
  "/party/ABCD/x",
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

test("every asset a page links is served from dist/assets", async ({
  request,
}) => {
  const html = await (await request.get("/g/petdle")).text();
  const assets = [...html.matchAll(/"(\/dist\/assets\/[^"]+)"/g)].map(
    (m) => m[1]!,
  );
  expect(assets.some((a) => a.endsWith(".js"))).toBe(true);
  expect(assets.some((a) => a.endsWith(".css"))).toBe(true);
  for (const asset of assets) {
    const response = await request.get(asset);
    expect(response.status(), asset).toBe(200);
    if (asset.endsWith(".js")) {
      expect((await request.get(`${asset}.map`)).status()).toBe(200);
    }
  }
});

for (const path of NOT_SERVED) {
  test(`${path} is a 404 with the app shell`, async ({ request }) => {
    const response = await request.get(path);

    expect(response.status()).toBe(404);
    expect(response.headers()["content-type"]).toContain("text/html");
    // The shell renders the not-found page in the browser (navigation.spec.ts)
    expect(await response.text()).toContain('<div id="root">');
  });
}
