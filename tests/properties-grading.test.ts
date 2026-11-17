import assert from "node:assert/strict";
import fc from "fast-check";
import { describe, it } from "vitest";
import { checkGuess, endingOf } from "../src/game/board.ts";
import { isImageGame, type GameKind } from "../src/game/blur.ts";
import {
  Correctness,
  gradeCorrectness,
  gradeNumber,
} from "../src/game/correctness.ts";
import { FREE_HINT_AFTER, hintChoices } from "../src/game/free-hint.ts";
import {
  boardColumns,
  gradeIds,
  isAnswerRow,
  SKIP,
  type Entry,
  type GameAttribute,
} from "../src/game/game.ts";
import { parseNumberValue } from "../src/game/number.ts";

const kinds: fc.Arbitrary<GameKind> = fc.constantFrom(
  "classic",
  "blur",
  "sequence",
  "quiz",
);
const word: fc.Arbitrary<string> = fc.string({ minLength: 1, maxLength: 6 });
const distinctWords = (max: number): fc.Arbitrary<string[]> =>
  fc.uniqueArray(word, { minLength: 1, maxLength: max });

// A classic game: 1-5 attributes of every type and 2-8 entries with a valid value for each
const valueOf = (
  type: GameAttribute["type"],
): fc.Arbitrary<string | string[]> =>
  type === "list"
    ? distinctWords(3)
    : type === "number"
      ? fc.integer({ min: -50, max: 50 }).map(String)
      : word;
const classicGame: fc.Arbitrary<{
  attributes: GameAttribute[];
  roster: Entry[];
}> = fc
  .array(fc.constantFrom("text", "list", "number", "image" as const), {
    minLength: 1,
    maxLength: 5,
  })
  .chain((types) => {
    const attributes = types.map((type, i): GameAttribute => ({
      name: `attr ${i}`,
      type,
    }));
    return fc
      .array(fc.tuple(...types.map(valueOf)), { minLength: 2, maxLength: 8 })
      .map((rows) => ({
        attributes,
        roster: rows.map((values, i): Entry => ({
          id: i + 1,
          name: `entry ${i + 1}`,
          photo: "",
          values,
        })),
      }));
  });

describe("grading properties", () => {
  it("a value always grades Correct against itself", () => {
    fc.assert(
      fc.property(fc.oneof(word, distinctWords(4)), (value) => {
        assert.equal(gradeCorrectness(value, value), Correctness.Correct);
      }),
    );
  });

  it("list grading is symmetric and ignores order", () => {
    fc.assert(
      fc.property(distinctWords(4), distinctWords(4), (a, b) => {
        assert.equal(gradeCorrectness(a, b), gradeCorrectness(b, a));
        assert.equal(
          gradeCorrectness([...a].reverse(), b),
          gradeCorrectness(a, b),
        );
      }),
    );
  });

  it("lists sharing nothing are Incorrect, sharing some are at least Partially", () => {
    fc.assert(
      fc.property(distinctWords(4), distinctWords(4), (a, b) => {
        const shared = a.some((x) => b.includes(x));
        const grade = gradeCorrectness(a, b);
        assert.equal(grade === Correctness.Incorrect, !shared);
      }),
    );
  });

  it("number grading points at the answer and is Correct only on the same value", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1e6, max: 1e6 }),
        fc.integer({ min: -1e6, max: 1e6 }),
        (g, a) => {
          const out = gradeNumber(String(g), String(a));
          if (g === a) {
            assert.deepEqual(out, { correctness: Correctness.Correct });
          } else {
            assert.equal(out.correctness, Correctness.Incorrect);
            assert.equal(out.hint, a > g ? "higher" : "lower");
          }
        },
      ),
    );
  });

  it("a parsed number reads back as the same number, and parsing is idempotent", () => {
    fc.assert(
      fc.property(fc.double({ min: -1e12, max: 1e12, noNaN: true }), (n) => {
        const text = n.toFixed(3);
        const parsed = parseNumberValue(` ${text.replace(".", ",")} `);
        assert.notEqual(parsed, null);
        assert.equal(Number(parsed), Number(text));
        assert.equal(parseNumberValue(parsed!), parsed);
      }),
    );
  });

  it("parseNumberValue never accepts text Number() cannot read", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 12 }), (raw) => {
        const parsed = parseNumberValue(raw);
        if (parsed !== null) {
          assert.ok(Number.isFinite(Number(parsed)));
        }
      }),
    );
  });
});

describe("gradeIds properties", () => {
  it("guessing every entry wins, with one column per board column and an all-correct row for the answer", () => {
    fc.assert(
      fc.property(classicGame, fc.nat(), ({ attributes, roster }, pick) => {
        const answer = roster[pick % roster.length]!;
        const result = gradeIds(
          attributes,
          roster,
          answer,
          roster.map((e) => e.id),
        );
        assert.equal(result.kind, "graded");
        if (result.kind !== "graded") {
          return;
        }
        assert.equal(result.victory, true);
        assert.equal(result.rows.length, roster.length);
        result.rows.forEach((row, i) => {
          assert.equal(row.length, boardColumns(attributes).length);
          if (roster[i]!.id === answer.id) {
            assert.ok(isAnswerRow(row));
          }
        });
      }),
    );
  });

  it("an unknown id is invalid and a repeated id is a duplicate, whatever the order", () => {
    fc.assert(
      fc.property(
        classicGame,
        fc.nat(),
        fc.nat(),
        ({ attributes, roster }, pick, at) => {
          const answer = roster[0]!;
          const ids = roster.map((e) => e.id);
          const bad = [...ids];
          bad.splice(at % (ids.length + 1), 0, 9999);
          assert.deepEqual(gradeIds(attributes, roster, answer, bad), {
            kind: "invalid",
          });
          const twice = [...ids, ids[pick % ids.length]!];
          assert.deepEqual(gradeIds(attributes, roster, answer, twice), {
            kind: "duplicate",
          });
        },
      ),
    );
  });

  it("SKIP is taken any number of times only by image games, and never wins", () => {
    fc.assert(
      fc.property(
        classicGame,
        kinds,
        fc.integer({ min: 1, max: 5 }),
        ({ attributes, roster }, kind, skips) => {
          const ids = Array.from({ length: skips }, () => SKIP);
          const result = gradeIds(attributes, roster, roster[0]!, ids, kind);
          if (isImageGame(kind)) {
            assert.equal(result.kind, "graded");
            assert.equal(result.kind === "graded" && result.victory, false);
          } else {
            assert.equal(result.kind, "invalid");
          }
        },
      ),
    );
  });

  it("victory is exactly whether the answer's id was guessed", () => {
    fc.assert(
      fc.property(
        classicGame,
        fc.nat(),
        fc.array(fc.boolean(), { maxLength: 8 }),
        ({ attributes, roster }, pick, keep) => {
          const answer = roster[pick % roster.length]!;
          const ids = roster.filter((_, i) => keep[i]).map((e) => e.id);
          const result = gradeIds(attributes, roster, answer, ids);
          assert.equal(
            result.kind === "graded" && result.victory,
            ids.includes(answer.id),
          );
        },
      ),
    );
  });
});

describe("Board properties", () => {
  it("a win beats used-up tries, which beat a give-up", () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        (won, lost, gaveUp) => {
          const ending = endingOf({ won, lost, gaveUp });
          assert.equal(
            ending,
            won ? "victory" : lost ? "lost" : gaveUp ? "give-up" : null,
          );
        },
      ),
    );
  });

  it("checkGuess takes each active entry once, nothing else, and SKIP only in image games", () => {
    fc.assert(
      fc.property(
        kinds,
        fc.uniqueArray(fc.integer({ min: 1, max: 30 }), { minLength: 1 }),
        fc.array(fc.integer({ min: 0, max: 40 })),
        fc.oneof(
          fc.integer({ min: -5, max: 40 }),
          fc.string(),
          fc.constant(null),
        ),
        (kind, activeIds, guessed, id) => {
          const active = activeIds.map((i) => ({ id: i }));
          const verdict = checkGuess(kind, active, guessed, id);
          if (id === SKIP && isImageGame(kind)) {
            assert.equal(verdict, "ok");
          } else if (typeof id !== "number" || !activeIds.includes(id)) {
            assert.equal(verdict, "invalid");
          } else {
            assert.equal(verdict, guessed.includes(id) ? "duplicate" : "ok");
          }
        },
      ),
    );
  });

  it("no Free Hint before FREE_HINT_AFTER wrong rows", () => {
    fc.assert(
      fc.property(classicGame, ({ attributes, roster }) => {
        const answer = roster[0]!;
        const wrong = roster.slice(1, FREE_HINT_AFTER);
        const result = gradeIds(
          attributes,
          roster,
          answer,
          wrong.map((e) => e.id),
        );
        if (result.kind === "graded" && result.rows.length < FREE_HINT_AFTER) {
          assert.equal(hintChoices(attributes, answer, result.rows), null);
        }
      }),
    );
  });
});
