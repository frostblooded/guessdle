import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { Correctness } from "../src/game/correctness.ts";
import {
  findEntryId,
  gradeGuess,
  gradeIds,
  hasAllValues,
  type Entry,
  type GameAttribute,
} from "../src/game/game.ts";

const ATTRIBUTES: GameAttribute[] = [
  { name: "Colors", type: "list" },
  { name: "Owner", type: "text" },
];
const entry = (
  id: number,
  name: string,
  colors: string[],
  owner: string,
): Entry => ({ id, name, photo: `/p/${id}.webp`, values: [colors, owner] });

const first = entry(1, "Ati", ["Black", "Orange"], "Niki");
const second = entry(2, "Bela", ["Orange", "Grey"], "Beti");
const third = entry(3, "Cookie", ["Red"], "Niki");
const ROSTER = [first, second, third];

describe("gradeGuess", () => {
  it("lists the photo, the name, then each attribute in order", () => {
    const row = gradeGuess(ATTRIBUTES, first, second);
    assert.deepEqual(
      row.map((cell) => [cell.key, cell.value]),
      [
        ["photo", "/p/2.webp"],
        ["name", "Bela"],
        ["Colors", ["Orange", "Grey"]],
        ["Owner", "Beti"],
      ],
    );
  });

  it("grades every column of the answer itself as correct", () => {
    for (const cell of gradeGuess(ATTRIBUTES, first, first)) {
      assert.equal(cell.correctness, Correctness.Correct, cell.key);
    }
  });

  it("grades Text by exact match and List by set overlap", () => {
    const byKey = Object.fromEntries(
      gradeGuess(ATTRIBUTES, first, second).map((c) => [c.key, c.correctness]),
    );
    assert.deepEqual(byKey, {
      photo: Correctness.Incorrect,
      name: Correctness.Incorrect,
      Colors: Correctness.PartiallyCorrect,
      Owner: Correctness.Incorrect,
    });
    assert.equal(
      gradeGuess(ATTRIBUTES, first, third)[3]!.correctness,
      Correctness.Correct,
    );
  });

  it("grades empty against empty as correct and against a value as incorrect", () => {
    const empty = entry(4, "Empty", [], "");
    const row = gradeGuess(ATTRIBUTES, empty, empty);
    assert.equal(row[2]!.correctness, Correctness.Correct);
    assert.equal(row[3]!.correctness, Correctness.Correct);
    const against = gradeGuess(ATTRIBUTES, first, empty);
    assert.equal(against[2]!.correctness, Correctness.Incorrect);
    assert.equal(against[3]!.correctness, Correctness.Incorrect);
  });

  it("marks only the answer's own photo cell correct, even with equal photos", () => {
    const twin = { ...second, id: 9, photo: first.photo };
    assert.equal(
      gradeGuess(ATTRIBUTES, first, twin)[0]!.correctness,
      Correctness.Incorrect,
    );
  });
});

describe("gradeGuess: Number attributes", () => {
  const attrs: GameAttribute[] = [{ name: "Age", type: "number" }];
  const aged = (id: number, age: string): Entry => ({
    id,
    name: `E${id}`,
    photo: "",
    values: [age],
  });

  it("adds the hint only to a wrong number", () => {
    const answer = aged(1, "7");
    const wrong = gradeGuess(attrs, answer, aged(2, "3"))[2]!;
    assert.equal(wrong.correctness, Correctness.Incorrect);
    assert.equal(wrong.hint, "higher");
    const right = gradeGuess(attrs, answer, aged(3, "7.0"))[2]!;
    assert.equal(right.correctness, Correctness.Correct);
    assert.equal("hint" in right, false);
  });

  it("leaves Text and List cells without a hint", () => {
    for (const cell of gradeGuess(ATTRIBUTES, first, second)) {
      assert.equal("hint" in cell, false, cell.key);
    }
  });
});

describe("hasAllValues", () => {
  it("needs every Text, Number and List value filled", () => {
    assert.equal(hasAllValues(["a", ["b"], "3"]), true);
    assert.equal(hasAllValues(["a", [], "3"]), false);
    assert.equal(hasAllValues(["", ["b"]]), false);
    assert.equal(hasAllValues([]), true);
  });
});

describe("gradeIds", () => {
  it("grades guesses in the order given, without victory on wrong ones", () => {
    const result = gradeIds(ATTRIBUTES, ROSTER, first, [2, 3]);
    assert.equal(result.kind, "graded");
    if (result.kind !== "graded") {
      return;
    }
    assert.equal(result.victory, false);
    assert.deepEqual(
      result.rows.map((row) => row[1]!.value),
      ["Bela", "Cookie"],
    );
  });

  it("reports victory when the answer is among the guesses", () => {
    const result = gradeIds(ATTRIBUTES, ROSTER, first, [2, 1]);
    assert.equal(result.kind === "graded" && result.victory, true);
  });

  it("accepts an empty list", () => {
    assert.deepEqual(gradeIds(ATTRIBUTES, ROSTER, first, []), {
      kind: "graded",
      rows: [],
      victory: false,
    });
  });

  it("rejects an id not in the roster", () => {
    for (const input of [99, 0, -1]) {
      assert.deepEqual(gradeIds(ATTRIBUTES, ROSTER, second, [input]), {
        kind: "invalid",
      });
    }
  });

  it("rejects a repeated id", () => {
    assert.deepEqual(gradeIds(ATTRIBUTES, ROSTER, first, [2, 2]), {
      kind: "duplicate",
    });
  });

  it("reports invalid before duplicate when both occur", () => {
    assert.deepEqual(gradeIds(ATTRIBUTES, ROSTER, first, [99, 2, 2]), {
      kind: "invalid",
    });
  });
});

describe("findEntryId", () => {
  it("finds an entry id from typed text, ignoring case", () => {
    assert.equal(findEntryId(ROSTER, "COOKIE"), 3);
    assert.equal(findEntryId(ROSTER, "Nobody"), null);
    assert.equal(findEntryId(ROSTER, ""), null);
  });
});
