import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Correctness } from "../src/game/correctness.ts";
import { findPetId, gradeGuess, gradeIds } from "../src/game/game.ts";
import { GUESS_DATA } from "../src/game/roster.ts";

const first = GUESS_DATA[0]!;
const second = GUESS_DATA[1]!;
const third = GUESS_DATA[2]!;

describe("gradeGuess", () => {
  it("lists every Attribute except the id in roster key order", () => {
    const row = gradeGuess(first, second);
    assert.deepEqual(
      row.map((cell) => cell.key),
      Object.keys(second).filter((key) => key !== "id"),
    );
    assert.deepEqual(
      row.map((cell) => cell.value),
      Object.entries(second)
        .filter(([key]) => key !== "id")
        .map(([, value]) => value),
    );
  });

  it("grades every Attribute of the answer itself as correct", () => {
    for (const cell of gradeGuess(first, first)) {
      assert.equal(cell.correctness, Correctness.Correct, cell.key);
    }
  });

  it("grades each Attribute with the shared Correctness rules", () => {
    const a = {
      id: "a",
      photo: "a",
      name: "A",
      colors: ["Red", "Blue"],
      owners: ["X"],
    };
    const b = {
      id: "b",
      photo: "b",
      name: "B",
      colors: ["Blue", "Green"],
      owners: ["X"],
    };
    const byKey = Object.fromEntries(
      gradeGuess(a, b).map((c) => [c.key, c.correctness]),
    );
    assert.deepEqual(byKey, {
      photo: Correctness.Incorrect,
      name: Correctness.Incorrect,
      colors: Correctness.PartiallyCorrect,
      owners: Correctness.Correct,
    });
  });
});

describe("gradeIds", () => {
  it("grades guesses in the order given, without victory on wrong ones", () => {
    const result = gradeIds(GUESS_DATA, first, [second.id, third.id]);
    assert.equal(result.kind, "graded");
    if (result.kind !== "graded") {
      return;
    }
    assert.equal(result.victory, false);
    assert.deepEqual(
      result.rows.map((row) => row[1]!.value),
      [second.name, third.name],
    );
  });

  it("reports victory when the answer is among the guesses", () => {
    const result = gradeIds(GUESS_DATA, first, [second.id, first.id]);
    assert.equal(result.kind === "graded" && result.victory, true);
  });

  it("accepts an empty list", () => {
    assert.deepEqual(gradeIds(GUESS_DATA, first, []), {
      kind: "graded",
      rows: [],
      victory: false,
    });
  });

  it("rejects an id not in the roster, a display name or another case", () => {
    for (const input of ["not-a-pet", "", first.name, first.id.toUpperCase()]) {
      assert.deepEqual(gradeIds(GUESS_DATA, second, [input]), {
        kind: "invalid",
      });
    }
  });

  it("rejects a repeated id", () => {
    assert.deepEqual(gradeIds(GUESS_DATA, first, [second.id, second.id]), {
      kind: "duplicate",
    });
  });

  it("reports invalid before duplicate when both occur", () => {
    assert.deepEqual(gradeIds(GUESS_DATA, first, ["x", second.id, second.id]), {
      kind: "invalid",
    });
  });
});

describe("findPetId", () => {
  it("finds a pet id from typed text, ignoring case", () => {
    assert.equal(findPetId(GUESS_DATA, third.name.toUpperCase()), third.id);
    assert.equal(findPetId(GUESS_DATA, "Nobody"), null);
    assert.equal(findPetId(GUESS_DATA, ""), null);
  });
});
