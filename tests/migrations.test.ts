import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { describe, it } from "node:test";

// Parallel branches each add "the next" migration; two with one number apply in an undefined order
describe("db/migrations", () => {
  it("numbers every file once, with no gaps", () => {
    const numbers = readdirSync("db/migrations")
      .filter((f) => f.endsWith(".sql"))
      .map((f) => Number(f.split("_")[0]))
      .sort((a, b) => a - b);
    assert.deepEqual(
      numbers,
      numbers.map((_, i) => i + 1),
    );
  });
});
