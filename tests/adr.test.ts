import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { describe, it } from "vitest";

// Parallel branches each take "the next" ADR number (0016 was taken twice once)
describe("docs/adr", () => {
  it("numbers every ADR once, with no gaps", () => {
    const numbers = readdirSync("docs/adr")
      .filter((f) => /^\d{4}-.*\.md$/.test(f))
      .map((f) => Number(f.slice(0, 4)))
      .sort((a, b) => a - b);
    assert.deepEqual(
      numbers,
      numbers.map((_, i) => i + 1),
    );
  });
});
