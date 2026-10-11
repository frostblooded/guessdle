import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const ROOT: string = join(import.meta.dirname, "..");
const read = (path: string): string => readFileSync(join(ROOT, path), "utf8");

// Local scripts are compiled from .ts beside themselves. Vendored libs/ are
// copied whole by the deploy job.
const localScripts: string[] = [
  ...read("index.html").matchAll(/<script src="([^"]+)"/g),
]
  .map((match: RegExpMatchArray): string => match[1]!)
  .filter((src: string): boolean => !src.startsWith("libs/"));

const tsconfigFiles: string[] = JSON.parse(read("tsconfig.json")).files;
const gitignoreLines: string[] = read(".gitignore").split(/\r?\n/);
const deployCopyLine: string = read(".github/workflows/deploy.yml")
  .split(/\r?\n/)
  .find((line: string): boolean => line.includes("cp index.html"))!;
const deployCopied: string[] = deployCopyLine.trim().split(/\s+/);

describe("every local script in index.html is wired everywhere", () => {
  it("finds the local scripts", () => {
    assert.ok(localScripts.length > 0);
  });

  for (const script of localScripts) {
    const source: string = script.replace(/\.js$/, ".ts");

    it(`${script}: compiled by tsconfig.json`, () => {
      assert.ok(tsconfigFiles.includes(source), `${source} not in tsconfig files`);
    });

    it(`${script}: gitignored as a build output`, () => {
      assert.ok(gitignoreLines.includes(`/${script}`), `/${script} not in .gitignore`);
    });

    it(`${script}: copied by the deploy job`, () => {
      assert.ok(deployCopied.includes(script), `${script} not in deploy.yml cp line`);
    });
  }
});
