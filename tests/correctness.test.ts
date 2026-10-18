import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  Correctness,
  correctnessClass,
  gradeCorrectness,
  gradeNumber,
} from "../src/game/correctness.ts";
import { parseNumberValue } from "../src/game/number.ts";

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

describe("gradeNumber", () => {
  it("is Correct on the same value, however it is written", () => {
    assert.deepEqual(gradeNumber("12", "12"), {
      correctness: Correctness.Correct,
    });
    assert.deepEqual(gradeNumber("2.50", "2.5"), {
      correctness: Correctness.Correct,
    });
  });

  it("is Incorrect with the way to the answer otherwise", () => {
    assert.deepEqual(gradeNumber("3", "10"), {
      correctness: Correctness.Incorrect,
      hint: "higher",
    });
    assert.deepEqual(gradeNumber("10", "3"), {
      correctness: Correctness.Incorrect,
      hint: "lower",
    });
    // Numerically, not as text: "9" sorts after "10"
    assert.equal(gradeNumber("9", "10").hint, "higher");
    assert.equal(gradeNumber("-1.5", "-2").hint, "lower");
  });

  it("grades blanks like Text, with no hint", () => {
    assert.deepEqual(gradeNumber("", ""), { correctness: Correctness.Correct });
    assert.deepEqual(gradeNumber("4", ""), {
      correctness: Correctness.Incorrect,
    });
  });
});

describe("parseNumberValue", () => {
  it("keeps whole numbers, decimals and negatives, trimmed", () => {
    assert.equal(parseNumberValue(" 12 "), "12");
    assert.equal(parseNumberValue("-3"), "-3");
    assert.equal(parseNumberValue("4.5"), "4.5");
    assert.equal(parseNumberValue(".5"), ".5");
  });

  it("reads a comma as the decimal point", () => {
    assert.equal(parseNumberValue("2,5"), "2.5");
  });

  it("refuses anything else", () => {
    for (const bad of [
      "",
      "abc",
      "1e5",
      "1.2.3",
      "12 cm",
      "1,000.5",
      "--1",
      "Infinity",
    ]) {
      assert.equal(parseNumberValue(bad), null, bad);
    }
  });
});
