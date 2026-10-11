import { expect, test } from "@playwright/test";

const SERVED = [
  ["/", "text/html"],
  ["/index.html", "text/html"],
  ["/styles.css", "text/css"],
  ["/dist/script.js", "text/javascript"],
  ["/dist/script.css", "text/css"],
  ["/favicon.ico", "image/x-icon"],
  ["/photos/ati.jpg", "image/jpeg"],
] as const;

const NOT_SERVED = [
  "/missing.html",
  "/photos/missing.jpg",
  "/photos/",
  "/package.json",
  "/server.mjs",
  "/script.ts",
  "/roster.ts",
  "/dist/",
  "/dist/../package.json",
  "/tests/e2e/server.spec.ts",
  "/docs/adr/0001-typescript-built-in-ci.md",
  "/.git/config",
  "/node_modules/typescript/package.json",
  "/photos/../package.json",
  "/photos/%2e%2e/package.json",
  "/photos/..%2fpackage.json",
  "/photos/%2e%2e%2fpackage.json",
  "/photos/%ZZ",
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
    expect(await response.text()).toContain("Back to PETDLE");
  });
}
