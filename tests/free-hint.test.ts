import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  hintChoices,
  isFreeHint,
  pickHint,
  revealHint,
  unsolvedAttributes,
} from "../src/game/free-hint.ts";
import { gradeIds, type Entry } from "../src/game/game.ts";
import { ATTRIBUTES, GUESS_DATA } from "./roster-fixture.ts";

// Ati: Colors Black, Orange; Owner Niki
const answer: Entry = { ...GUESS_DATA[0]!, description: "Loves boxes." };
const plain: Entry = GUESS_DATA[0]!;
const rowsOf = (ids: number[], of: Entry = answer) => {
  const graded = gradeIds(ATTRIBUTES, GUESS_DATA, of, ids);
  assert.equal(graded.kind, "graded");
  return graded.kind === "graded" ? graded.rows : [];
};

describe("unsolvedAttributes", () => {
  it("lists every attribute before any guess", () => {
    assert.deepEqual(unsolvedAttributes(ATTRIBUTES, answer, []), [
      "Colors",
      "Owner",
    ]);
  });
  it("drops an attribute a guess matched, but not a partial match", () => {
    // Cookie: Orange (partial), Niki (correct)
    assert.deepEqual(unsolvedAttributes(ATTRIBUTES, answer, rowsOf([3])), [
      "Colors",
    ]);
  });
  it("skips an attribute the answer has no value for", () => {
    const blank: Entry = { ...answer, values: [["Black"], ""] };
    assert.deepEqual(unsolvedAttributes(ATTRIBUTES, blank, []), ["Colors"]);
  });
});

describe("hintChoices", () => {
  it("offers nothing before 3 guesses", () => {
    assert.equal(hintChoices(ATTRIBUTES, answer, rowsOf([2, 3])), null);
  });
  it("offers both kinds after 3 wrong guesses", () => {
    assert.deepEqual(hintChoices(ATTRIBUTES, answer, rowsOf([2, 3, 4])), {
      attribute: true,
      description: true,
    });
  });
  it("offers no description when the answer has none", () => {
    assert.deepEqual(hintChoices(ATTRIBUTES, plain, rowsOf([2, 3, 4], plain)), {
      attribute: true,
      description: false,
    });
  });
  it("offers nothing when every attribute is matched and there is no description", () => {
    const twin: Entry = { ...GUESS_DATA[2]!, values: plain.values };
    const roster = [...GUESS_DATA.slice(0, 2), twin, ...GUESS_DATA.slice(3)];
    const graded = gradeIds(ATTRIBUTES, roster, plain, [2, 3, 4]);
    assert.ok(graded.kind === "graded");
    assert.equal(hintChoices(ATTRIBUTES, plain, graded.rows), null);
  });
});

describe("pickHint and revealHint", () => {
  const rows = rowsOf([2, 3, 4]);
  it("draws among the unsolved attributes only", () => {
    // Cookie matched Owner, so Colors is the one left
    for (const random of [0, 0.5, 0.99]) {
      assert.deepEqual(
        pickHint(ATTRIBUTES, answer, rows, "attribute", () => random),
        { kind: "attribute", attribute: "Colors" },
      );
    }
  });
  it("draws at random when several are open", () => {
    const open = rowsOf([2, 4, 5]);
    assert.deepEqual(
      pickHint(ATTRIBUTES, answer, open, "attribute", () => 0.99),
      { kind: "attribute", attribute: "Owner" },
    );
    assert.deepEqual(
      pickHint(ATTRIBUTES, answer, open, "attribute", () => 0),
      { kind: "attribute", attribute: "Colors" },
    );
  });
  it("refuses a kind not on offer", () => {
    const own = rowsOf([2, 3, 4], plain);
    assert.equal(
      pickHint(ATTRIBUTES, plain, own, "description", () => 0),
      null,
    );
    assert.equal(
      pickHint(ATTRIBUTES, answer, rowsOf([2]), "attribute", () => 0),
      null,
    );
  });
  it("shows the answer's value or description", () => {
    assert.deepEqual(
      revealHint(ATTRIBUTES, answer, {
        kind: "attribute",
        attribute: "Colors",
      }),
      { kind: "attribute", attribute: "Colors", value: ["Black", "Orange"] },
    );
    assert.deepEqual(revealHint(ATTRIBUTES, answer, { kind: "description" }), {
      kind: "description",
      description: "Loves boxes.",
    });
  });
  it("marks an Image attribute's value as a picture", () => {
    const withImage = [
      ...ATTRIBUTES,
      { name: "Photo", type: "image" as const },
    ];
    const pictured: Entry = {
      ...answer,
      values: [...answer.values, "/uploads/ati.webp"],
    };
    assert.deepEqual(
      revealHint(withImage, pictured, {
        kind: "attribute",
        attribute: "Photo",
      }),
      {
        kind: "attribute",
        attribute: "Photo",
        value: "/uploads/ati.webp",
        image: true,
      },
    );
    assert.ok(
      isFreeHint({
        kind: "attribute",
        attribute: "P",
        value: "/x",
        image: true,
      }),
    );
  });
  it("shows nothing for an attribute that no longer exists", () => {
    assert.equal(
      revealHint(ATTRIBUTES, answer, { kind: "attribute", attribute: "Gone" }),
      null,
    );
  });
});

describe("isFreeHint", () => {
  it("accepts both kinds and refuses anything else", () => {
    assert.ok(isFreeHint({ kind: "description", description: "x" }));
    assert.ok(isFreeHint({ kind: "attribute", attribute: "A", value: "1" }));
    assert.ok(isFreeHint({ kind: "attribute", attribute: "A", value: ["1"] }));
    assert.ok(!isFreeHint(null));
    assert.ok(!isFreeHint({ kind: "attribute", attribute: "A", value: 1 }));
    assert.ok(!isFreeHint({ kind: "other" }));
  });
});
