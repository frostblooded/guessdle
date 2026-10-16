import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  Correctness,
  correctnessClass,
  gradeCorrectness,
} from "../src/correctness.ts";

describe("gradeCorrectness: single-value attribute", () => {
  it("is Correct when the names match", () => {
    assert.equal(gradeCorrectness("Oreo", "Oreo"), Correctness.Correct);
  });

  it("is Incorrect when the names differ", () => {
    assert.equal(gradeCorrectness("Oreo", "Milo"), Correctness.Incorrect);
  });

  it("compares case-sensitively", () => {
    assert.equal(gradeCorrectness("oreo", "Oreo"), Correctness.Incorrect);
  });
});

describe("gradeCorrectness: multi-value attribute", () => {
  it("is Correct for identical lists", () => {
    assert.equal(
      gradeCorrectness(["black", "white"], ["black", "white"]),
      Correctness.Correct,
    );
  });

  it("is Correct for the same values in a different order", () => {
    assert.equal(
      gradeCorrectness(["white", "black"], ["black", "white"]),
      Correctness.Correct,
    );
  });

  it("is PartiallyCorrect when the lists share some values", () => {
    assert.equal(
      gradeCorrectness(["black", "brown"], ["black", "white"]),
      Correctness.PartiallyCorrect,
    );
  });

  it("is PartiallyCorrect when the guess is a subset of the answer", () => {
    assert.equal(
      gradeCorrectness(["black"], ["black", "white"]),
      Correctness.PartiallyCorrect,
    );
  });

  it("is PartiallyCorrect when the guess is a superset of the answer", () => {
    assert.equal(
      gradeCorrectness(["black", "white", "tan"], ["black"]),
      Correctness.PartiallyCorrect,
    );
  });

  it("is Incorrect when the lists share no values", () => {
    assert.equal(
      gradeCorrectness(["brown"], ["black", "white"]),
      Correctness.Incorrect,
    );
  });

  it("is Correct when both lists are empty", () => {
    assert.equal(gradeCorrectness([], []), Correctness.Correct);
  });

  it("is Incorrect when only the guess is empty", () => {
    assert.equal(gradeCorrectness([], ["black"]), Correctness.Incorrect);
  });

  it("is Incorrect when only the answer is empty", () => {
    assert.equal(gradeCorrectness(["black"], []), Correctness.Incorrect);
  });
});

describe("gradeCorrectness: inputs are not mutated", () => {
  const cases: [string, string[], string[], number][] = [
    ["Correct", ["white", "black"], ["white", "black"], Correctness.Correct],
    [
      "Correct (reordered)",
      ["white", "black"],
      ["black", "white"],
      Correctness.Correct,
    ],
    [
      "PartiallyCorrect",
      ["white", "brown"],
      ["white", "black"],
      Correctness.PartiallyCorrect,
    ],
    ["Incorrect", ["white", "tan"], ["brown", "black"], Correctness.Incorrect],
  ];

  for (const [name, guess, answer, expected] of cases) {
    it(`leaves frozen unsorted arrays untouched: ${name}`, () => {
      const guessCopy = [...guess];
      const answerCopy = [...answer];
      Object.freeze(guess);
      Object.freeze(answer);
      assert.equal(gradeCorrectness(guess, answer), expected);
      assert.deepEqual(guess, guessCopy);
      assert.deepEqual(answer, answerCopy);
    });
  }
});

describe("gradeCorrectness: edge cases in multi-value comparison", () => {
  it("does not treat a comma inside a value as a separator", () => {
    assert.equal(gradeCorrectness(["a,b"], ["a", "b"]), Correctness.Incorrect);
  });
});

describe("correctnessClass", () => {
  it("maps each Correctness to its CSS class", () => {
    assert.equal(correctnessClass(Correctness.Correct), "correct");
    assert.equal(
      correctnessClass(Correctness.PartiallyCorrect),
      "partially-correct",
    );
    assert.equal(correctnessClass(Correctness.Incorrect), "incorrect");
  });
});
