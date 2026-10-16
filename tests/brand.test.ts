import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

// Files where "Petdle" is the game's own data or history, not the site brand
const EXEMPT_FILES =
  /^(db\/migrations\/|docs\/adr\/0003-|docs\/adr\/0013-|docs\/architecture\.md|CONTEXT\.md|tests\/brand\.test\.ts|tests\/integration\/(games|migrate)\.test\.ts|tests\/integration\/petdle\.ts|tests\/e2e\/roster\.ts|src\/server\/import-photos\.ts)/;

// Infrastructure identifiers and the game's slug stay "petdle" (spec #66, "Rename")
const KEPT = [
  /petdle-/g, // backup file names, temp dirs, image names
  /petdle:/g, // postgres credentials, localStorage keys
  /\/petdle\b/g, // database name, /g/petdle, /api/games/petdle
  /['"]petdle['"]/g, // game slug, database names
  /: petdle\b/g, // compose env values, name: petdle
  /(-U|-d|createdb|dropdb --if-exists) petdle\b/g,
  /petdle\.ts/g, // test fixture module
];

describe("brand", () => {
  it("keeps Petdle only as the game's data or as infrastructure identifiers", () => {
    const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
      .split("\0")
      .filter(
        (f) => f && !EXEMPT_FILES.test(f) && !/\.(jpg|png|webp|ico)$/.test(f),
      );
    const found: string[] = [];
    for (const file of files) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        const rest = KEPT.reduce((s, re) => s.replace(re, ""), line);
        if (/petdle/i.test(rest)) {
          found.push(`${file}:${i + 1}: ${line.trim()}`);
        }
      });
    }
    assert.deepEqual(found, []);
  });
});
