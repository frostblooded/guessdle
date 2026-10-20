import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { isComplete, KINDS } from "../src/game/kinds.ts";

const filled = { valuesFilled: true, tries: 3 };

describe("KINDS", () => {
  it("lets only a Sequence entry stay incomplete without pausing its game", () => {
    assert.deepEqual(
      Object.entries(KINDS)
        .filter(([, k]) => !k.pauses)
        .map(([kind]) => kind),
      ["sequence"],
    );
  });
  it("gives each kind-specific field to the kinds that store it", () => {
    assert.equal(KINDS.blur.blurOrder && KINDS.blur.photo, true);
    assert.equal(KINDS.quiz.quiz && KINDS.quiz.photo, true);
    assert.equal(KINDS.sequence.shots, true);
    assert.equal(KINDS.classic.photo || KINDS.classic.shots, false);
  });
});

describe("isComplete", () => {
  it("needs a Classic entry's values", () => {
    assert.equal(isComplete("classic", {}, filled), true);
    assert.equal(
      isComplete("classic", {}, { ...filled, valuesFilled: false }),
      false,
    );
  });
  it("needs a Blur entry's image and square order, not its values", () => {
    const order = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    const off = { ...filled, valuesFilled: false };
    assert.equal(
      isComplete("blur", { photo: "/a", blurOrder: order }, off),
      true,
    );
    assert.equal(
      isComplete("blur", { photo: "", blurOrder: order }, filled),
      false,
    );
    assert.equal(
      isComplete("blur", { photo: "/a", blurOrder: null }, filled),
      false,
    );
  });
  it("needs a Sequence entry's photos up to the game's count", () => {
    assert.equal(
      isComplete("sequence", { shots: ["/a", "/b", "/c"] }, filled),
      true,
    );
    assert.equal(
      isComplete("sequence", { shots: ["/a", "", "/c"] }, filled),
      false,
    );
    assert.equal(isComplete("sequence", {}, filled), false);
  });
  it("needs a Quiz question's answer", () => {
    assert.equal(
      isComplete("quiz", { quiz: { options: ["A"], correct: 0 } }, filled),
      true,
    );
    assert.equal(isComplete("quiz", { quiz: null }, filled), false);
    assert.equal(isComplete("quiz", {}, filled), false);
  });
});
