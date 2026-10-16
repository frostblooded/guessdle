import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const read = (path: string): string =>
  readFileSync(join(import.meta.dirname, "..", path), "utf8");

describe("build output is wired through the page and the deploy", () => {
  const html: string = read("index.html");

  for (const asset of ["dist/script.js", "dist/script.css"]) {
    it(`index.html loads ${asset}`, () => {
      assert.ok(
        html.includes(`"${asset}"`),
        `${asset} not referenced in index.html`,
      );
    });
  }

  it("Pages serves redirect.html as index and 404, all to one URL", () => {
    const deploy: string = read(".github/workflows/deploy.yml");
    assert.match(deploy, /cp redirect\.html _site\/index\.html/);
    assert.match(deploy, /cp redirect\.html _site\/404\.html/);
    const redirect: string = read("redirect.html");
    const urls: string[] = [
      ...redirect.matchAll(/https:\/\/guessdle\.niki\.casa\//g),
    ].map((m) => m[0]);
    assert.equal(urls.length, 3, "meta refresh, location.replace, link");
    assert.match(redirect, /http-equiv="refresh"[^>]*url=https:/);
    assert.match(redirect, /location\.replace\("https:/);
    assert.match(redirect, /<a href="https:/);
  });

  it("dist is gitignored", () => {
    assert.ok(read(".gitignore").split(/\r?\n/).includes("/dist"));
  });
});
