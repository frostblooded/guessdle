import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { Correctness } from "../src/game/correctness.ts";
import {
  boardColumns,
  findEntryId,
  firstImage,
  gradeGuess,
  gradeIds,
  guessedNames,
  hasAllValues,
  isSkipRow,
  SKIP,
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
  it("lists the name, then each attribute in order", () => {
    const row = gradeGuess(ATTRIBUTES, first, second);
    assert.deepEqual(
      row.map((cell) => [cell.key, cell.value]),
      [
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
      name: Correctness.Incorrect,
      Colors: Correctness.PartiallyCorrect,
      Owner: Correctness.Incorrect,
    });
    assert.equal(
      gradeGuess(ATTRIBUTES, first, third)[2]!.correctness,
      Correctness.Correct,
    );
  });

  it("grades empty against empty as correct and against a value as incorrect", () => {
    const empty = entry(4, "Empty", [], "");
    const row = gradeGuess(ATTRIBUTES, empty, empty);
    assert.equal(row[1]!.correctness, Correctness.Correct);
    assert.equal(row[2]!.correctness, Correctness.Correct);
    const against = gradeGuess(ATTRIBUTES, first, empty);
    assert.equal(against[1]!.correctness, Correctness.Incorrect);
    assert.equal(against[2]!.correctness, Correctness.Incorrect);
  });
});

describe("gradeGuess: Image attributes", () => {
  const attrs: GameAttribute[] = [
    { name: "Owner", type: "text" },
    { name: "Photo", type: "image" },
  ];
  const pic = (id: number, url: string): Entry => ({
    id,
    name: `E${id}`,
    photo: url,
    values: ["Niki", url],
  });

  it("keeps the column in Attribute order, flagged as a picture", () => {
    const row = gradeGuess(attrs, pic(1, "/a.webp"), pic(2, "/b.webp"));
    assert.deepEqual(
      row.map((cell) => [cell.key, cell.value, cell.image ?? false]),
      [
        ["name", "E2", false],
        ["Owner", "Niki", false],
        ["Photo", "/b.webp", true],
      ],
    );
  });

  it("is correct only on the answer itself, even with the same picture", () => {
    const answer = pic(1, "/a.webp");
    assert.equal(
      gradeGuess(attrs, answer, pic(2, "/a.webp"))[2]!.correctness,
      Correctness.Incorrect,
    );
    assert.equal(
      gradeGuess(attrs, answer, answer)[2]!.correctness,
      Correctness.Correct,
    );
  });

  it("allows a blank picture", () => {
    const cell = gradeGuess(attrs, pic(1, "/a.webp"), pic(2, ""))[2]!;
    assert.equal(cell.value, "");
    assert.equal(cell.image, true);
  });
});

describe("boardColumns", () => {
  it("puts Name first, then every attribute in order", () => {
    const attrs: GameAttribute[] = [
      { name: "Colors", type: "list" },
      { name: "Photo", type: "image" },
    ];
    assert.deepEqual(boardColumns(attrs), [
      { title: "Name", image: false },
      { title: "Colors", image: false, attribute: 0 },
      { title: "Photo", image: true, attribute: 1 },
    ]);
  });

  it("shows only the name in a Blur game", () => {
    assert.deepEqual(boardColumns(ATTRIBUTES, "blur"), [
      { title: "Name", image: false },
    ]);
  });
});

describe("firstImage", () => {
  const attrs: GameAttribute[] = [
    { name: "Owner", type: "text" },
    { name: "Side", type: "image" },
    { name: "Front", type: "image" },
  ];

  it("is the first Image value that is not blank", () => {
    assert.equal(firstImage(attrs, ["x", "/s.webp", "/f.webp"]), "/s.webp");
    assert.equal(firstImage(attrs, ["x", "", "/f.webp"]), "/f.webp");
  });

  it("is blank without a picture, and never takes another type's value", () => {
    assert.equal(firstImage(attrs, ["/not.webp", "", ""]), "");
    assert.equal(firstImage([], []), "");
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
    const wrong = gradeGuess(attrs, answer, aged(2, "3"))[1]!;
    assert.equal(wrong.correctness, Correctness.Incorrect);
    assert.equal(wrong.hint, "higher");
    const right = gradeGuess(attrs, answer, aged(3, "7.0"))[1]!;
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
  const attrs: GameAttribute[] = [
    { name: "T", type: "text" },
    { name: "L", type: "list" },
    { name: "N", type: "number" },
    { name: "I", type: "image" },
  ];

  it("needs every Text, Number and List value filled", () => {
    assert.equal(hasAllValues(attrs, ["a", ["b"], "3", "/i.webp"]), true);
    assert.equal(hasAllValues(attrs, ["a", [], "3", "/i.webp"]), false);
    assert.equal(hasAllValues(attrs, ["", ["b"], "3", ""]), false);
    assert.equal(hasAllValues([], []), true);
  });

  it("lets an Image value stay blank", () => {
    assert.equal(hasAllValues(attrs, ["a", ["b"], "3", ""]), true);
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
      result.rows.map((row) => row[0]!.value),
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

describe("gradeIds: Blur games", () => {
  it("grades the name only, so no photo reaches the player", () => {
    const out = gradeIds(ATTRIBUTES, ROSTER, first, [2, 1], "blur");
    assert.deepEqual(out, {
      kind: "graded",
      rows: [
        [{ key: "name", value: "Bela", correctness: Correctness.Incorrect }],
        [{ key: "name", value: "Ati", correctness: Correctness.Correct }],
      ],
      victory: true,
    });
  });
});

describe("gradeIds: skips", () => {
  it("grades any number of skips as wrong rows in a Blur game", () => {
    const out = gradeIds(ATTRIBUTES, ROSTER, first, [SKIP, 2, SKIP], "blur");
    assert.equal(out.kind, "graded");
    if (out.kind !== "graded") {
      return;
    }
    assert.equal(out.victory, false);
    assert.deepEqual(
      out.rows.map((row) => isSkipRow(row)),
      [true, false, true],
    );
    assert.deepEqual(out.rows[0], [
      { key: "skip", value: "Skipped", correctness: Correctness.Incorrect },
    ]);
    // A skip names nobody, so it takes no name out of the suggestions
    assert.deepEqual([...guessedNames(out.rows)], ["Bela"]);
  });
  it("refuses a skip in a classic game", () => {
    assert.deepEqual(gradeIds(ATTRIBUTES, ROSTER, first, [SKIP]), {
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
