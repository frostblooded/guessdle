import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { isGameKind, isImageGame } from "../src/game/blur.ts";
import { Correctness } from "../src/game/correctness.ts";
import { gradeIds, SKIP, type Entry } from "../src/game/game.ts";
import { hasAllShots, slotCount } from "../src/game/sequence.ts";
import { drawSequenceAnswer } from "../src/server/answers.ts";

describe("sequence kind", () => {
  it("is a game kind and an image game", () => {
    assert.ok(isGameKind("sequence"));
    assert.ok(isImageGame("sequence"));
    assert.ok(isImageGame("blur"));
    assert.ok(!isImageGame("classic"));
  });
});

describe("hasAllShots", () => {
  it("needs the first `count` slots filled", () => {
    assert.ok(hasAllShots(["a", "b", "c"], 3));
    assert.ok(hasAllShots(["a", "b", "c", ""], 3));
    assert.ok(!hasAllShots(["a", "", "c"], 3));
    assert.ok(!hasAllShots(["a", "b"], 3));
    assert.ok(!hasAllShots([], 1));
  });
});

describe("slotCount", () => {
  it("shows the game's count, and any filled slot beyond it", () => {
    assert.equal(slotCount([], 6), 6);
    assert.equal(slotCount(["a", "", "", "", "b"], 3), 5);
    assert.equal(slotCount(["a", "", "", "", ""], 3), 3);
  });
});

describe("drawSequenceAnswer", () => {
  const ids = [3, 1, 2];
  const never = new Set<number>();
  it("takes the oldest entry never an answer", () => {
    assert.equal(
      drawSequenceAnswer(ids, never, never, [], 0, () => 0.9),
      1,
    );
    assert.equal(
      drawSequenceAnswer(ids, new Set([1]), never, [1], 0, () => 0.9),
      2,
    );
  });
  it("leaves entries scheduled later for their day", () => {
    assert.equal(
      drawSequenceAnswer(ids, never, new Set([1, 2]), [], 0, () => 0),
      3,
    );
  });
  it("draws outside the skip period once every entry was used", () => {
    const used = new Set(ids);
    assert.equal(
      drawSequenceAnswer(ids, used, never, [3, 1], 2, () => 0),
      2,
    );
    // Every entry scheduled later: the draw ignores that
    assert.equal(
      drawSequenceAnswer(ids, used, new Set(ids), [2], 1, () => 0),
      3,
    );
  });
});

describe("gradeIds with skips", () => {
  const entry = (id: number, name: string): Entry => ({
    id,
    name,
    photo: "",
    values: [],
  });
  const roster = [entry(1, "A"), entry(2, "B")];
  it("grades a skip as a wrong one-cell row, and allows repeats", () => {
    const out = gradeIds(
      [],
      roster,
      roster[0]!,
      [SKIP, SKIP, 2, 1],
      "sequence",
    );
    assert.equal(out.kind, "graded");
    if (out.kind === "graded") {
      assert.deepEqual(out.rows[0], [
        { key: "name", value: "Skipped", correctness: Correctness.Incorrect },
      ]);
      assert.equal(out.rows.length, 4);
      assert.equal(out.victory, true);
    }
  });
  it("refuses a skip in a classic game", () => {
    assert.equal(gradeIds([], roster, roster[0]!, [SKIP]).kind, "invalid");
  });
});
