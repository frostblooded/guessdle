import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const read = (path: string): string => readFileSync(join(import.meta.dirname, "..", path), "utf8");

describe("build output is wired through the page and the deploy", () => {
  const html: string = read("index.html");

  for (const asset of ["dist/script.js", "dist/script.css"]) {
    it(`index.html loads ${asset}`, () => {
      assert.ok(html.includes(`"${asset}"`), `${asset} not referenced in index.html`);
    });
  }

  it("deploy.yml builds and copies dist", () => {
    const deploy: string = read(".github/workflows/deploy.yml");
    assert.ok(deploy.includes("npm run build"), "deploy.yml does not run the build");
    assert.match(deploy, /cp -r dist\b/);
  });

  it("dist is gitignored", () => {
    assert.ok(read(".gitignore").split(/\r?\n/).includes("/dist"));
  });
});
