import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "vitest";

const root: string = join(import.meta.dirname, "..");
const read = (path: string): string => readFileSync(join(root, path), "utf8");
const map: string = read("docs/features.md");

const routes: string[] = [
  ...read("src/App.tsx").matchAll(/path="(\/[^"]*)"/g),
].map((m) => m[1]!);
const headings: string[] = [...map.matchAll(/^## `([^`]+)`$/gm)].map(
  (m) => m[1]!,
);
const named: string[] = [
  ...map.matchAll(/`((?:src|tests|docs)\/[^`]+\.[a-z]+)`/g),
].map((m) => m[1]!);

describe("feature map (docs/features.md)", () => {
  it("has a section for every route in src/App.tsx, and no stale ones", () => {
    assert.ok(routes.length > 10, "found the routes");
    assert.deepEqual([...headings].sort(), [...routes].sort());
  });

  it("names only files that exist", () => {
    const missing = named.filter((path) => !existsSync(join(root, path)));
    assert.deepEqual(missing, []);
  });

  it("gives every e2e spec and UI test a feature", () => {
    const tests = [
      ...readdirSync(join(root, "tests/e2e"))
        .filter((f) => f.endsWith(".spec.ts"))
        .map((f) => `tests/e2e/${f}`),
      ...readdirSync(join(root, "tests/ui"))
        .filter((f) => f.endsWith(".test.tsx"))
        .map((f) => `tests/ui/${f}`),
    ];
    const orphans = tests.filter((path) => !named.includes(path));
    assert.deepEqual(orphans, []);
  });

  it("gives every page component under src/routes a feature", () => {
    const pages = readdirSync(join(root, "src/routes"), {
      recursive: true,
      encoding: "utf8",
    })
      .filter((f) => f.endsWith("-page.tsx"))
      .map((f) => `src/routes/${f.split("\\").join("/")}`);
    const orphans = pages.filter((path) => !named.includes(path));
    assert.deepEqual(orphans, []);
  });
});
