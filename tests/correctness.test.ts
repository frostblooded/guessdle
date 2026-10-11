import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Correctness, loadGame } from "./helpers/load-game.ts";

const game = loadGame();

describe("gradeCorrectness: single-value attribute", () => {
  it("is Correct when the names match", () => {
    assert.equal(game.gradeCorrectness("Oreo", "Oreo"), Correctness.Correct);
  });

  it("is Incorrect when the names differ", () => {
    assert.equal(game.gradeCorrectness("Oreo", "Milo"), Correctness.Incorrect);
  });

  it("compares case-sensitively", () => {
    assert.equal(game.gradeCorrectness("oreo", "Oreo"), Correctness.Incorrect);
  });
});

describe("gradeCorrectness: multi-value attribute", () => {
  it("is Correct for identical lists", () => {
    assert.equal(
      game.gradeCorrectness(["black", "white"], ["black", "white"]),
      Correctness.Correct,
    );
  });

  it("is Correct for the same values in a different order", () => {
    assert.equal(
      game.gradeCorrectness(["white", "black"], ["black", "white"]),
      Correctness.Correct,
    );
  });

  it("is PartiallyCorrect when the lists share some values", () => {
    assert.equal(
      game.gradeCorrectness(["black", "brown"], ["black", "white"]),
      Correctness.PartiallyCorrect,
    );
  });

  it("is PartiallyCorrect when the guess is a subset of the answer", () => {
    assert.equal(
      game.gradeCorrectness(["black"], ["black", "white"]),
      Correctness.PartiallyCorrect,
    );
  });

  it("is PartiallyCorrect when the guess is a superset of the answer", () => {
    assert.equal(
      game.gradeCorrectness(["black", "white", "tan"], ["black"]),
      Correctness.PartiallyCorrect,
    );
  });

  it("is Incorrect when the lists share no values", () => {
    assert.equal(
      game.gradeCorrectness(["brown"], ["black", "white"]),
      Correctness.Incorrect,
    );
  });

  it("is Correct when both lists are empty", () => {
    assert.equal(game.gradeCorrectness([], []), Correctness.Correct);
  });

  it("is Incorrect when only the guess is empty", () => {
    assert.equal(game.gradeCorrectness([], ["black"]), Correctness.Incorrect);
  });

  it("is Incorrect when only the answer is empty", () => {
    assert.equal(game.gradeCorrectness(["black"], []), Correctness.Incorrect);
  });
});

describe("correctnessClass", () => {
  it("maps each Correctness to its CSS class", () => {
    assert.equal(game.correctnessClass(Correctness.Correct), "correct");
    assert.equal(
      game.correctnessClass(Correctness.PartiallyCorrect),
      "partially-correct",
    );
    assert.equal(game.correctnessClass(Correctness.Incorrect), "incorrect");
  });
});
