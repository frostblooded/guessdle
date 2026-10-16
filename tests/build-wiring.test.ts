import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
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
    assert.match(deploy, /cp deploy\/redirect\.html _site\/index\.html/);
    assert.match(deploy, /cp deploy\/redirect\.html _site\/404\.html/);
    const redirect: string = read("deploy/redirect.html");
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

  it("prod build hashes bundle names and rewrites index.html to match", () => {
    const out: string = mkdtempSync(join(tmpdir(), "petdle-prod-"));
    execFileSync("node", ["scripts/build-prod.mjs", out], {
      cwd: join(import.meta.dirname, ".."),
    });
    const prodHtml: string = readFileSync(join(out, "index.html"), "utf8");
    const refs: string[] = [
      ...prodHtml.matchAll(/"dist\/(script-[A-Z0-9]+\.(?:js|css))"/g),
    ].map((m) => m[1]!);
    assert.equal(refs.length, 2, "one hashed js and one hashed css");
    for (const ref of refs) {
      assert.ok(existsSync(join(out, ref)), ref);
    }
    assert.ok(!prodHtml.includes('"dist/script.js"'));
    assert.ok(!prodHtml.includes('"dist/script.css"'));
    assert.ok(!prodHtml.includes("styles.css"), "styles live in the bundle");
  });

  it("nginx revalidates by default and caches dist/ forever", () => {
    const conf: string = read("deploy/nginx.conf");
    assert.match(conf, /add_header Cache-Control "no-cache"/);
    assert.match(conf, /location \/dist\/ \{[^}]*max-age=31536000, immutable/);
  });
});
