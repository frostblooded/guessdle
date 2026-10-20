import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { checkGuess, endingOf, hintOffer, isOver } from "../src/game/board.ts";
import { gradeIds, SKIP, type Entry } from "../src/game/game.ts";
import { ATTRIBUTES, GUESS_DATA } from "./roster-fixture.ts";

const answer: Entry = GUESS_DATA[0]!;
const wrong = GUESS_DATA.filter((e) => e.id !== answer.id).map((e) => e.id);
const rowsOf = (ids: number[]) => {
  const graded = gradeIds(ATTRIBUTES, GUESS_DATA, answer, ids);
  assert.equal(graded.kind, "graded");
  return graded.kind === "graded" ? graded.rows : [];
};

describe("endingOf", () => {
  it("is null while the board is still on", () => {
    assert.equal(endingOf({ won: false }), null);
    assert.equal(isOver({ won: false, gaveUp: false, lost: false }), false);
  });
  it("ranks a win over running out of tries over giving up", () => {
    assert.equal(endingOf({ won: true, gaveUp: true, lost: true }), "victory");
    assert.equal(endingOf({ won: false, gaveUp: true, lost: true }), "lost");
    assert.equal(endingOf({ won: false, gaveUp: true }), "give-up");
    assert.equal(isOver({ won: false, gaveUp: true }), true);
  });
});

describe("checkGuess", () => {
  it("takes an active entry not guessed yet", () => {
    assert.equal(checkGuess("classic", GUESS_DATA, [], answer.id), "ok");
  });
  it("refuses an unknown id or a non-number", () => {
    assert.equal(checkGuess("classic", GUESS_DATA, [], 9999), "invalid");
    assert.equal(checkGuess("classic", GUESS_DATA, [], "1"), "invalid");
  });
  it("refuses an entry guessed already", () => {
    assert.equal(
      checkGuess("classic", GUESS_DATA, [answer.id], answer.id),
      "duplicate",
    );
  });
  it("takes a skip only in Blur and Sequence games, as often as it likes", () => {
    assert.equal(checkGuess("classic", GUESS_DATA, [], SKIP), "invalid");
    assert.equal(checkGuess("blur", GUESS_DATA, [SKIP], SKIP), "ok");
    assert.equal(checkGuess("sequence", GUESS_DATA, [SKIP], SKIP), "ok");
  });
});

describe("hintOffer", () => {
  const rows = rowsOf(wrong.slice(0, 3));
  const on = { over: false, used: false };
  it("offers a Classic game's hint once enough guesses are wrong", () => {
    assert.deepEqual(hintOffer("classic", ATTRIBUTES, answer, rows, on), {
      attribute: true,
    });
    assert.equal(
      hintOffer("classic", ATTRIBUTES, answer, rows.slice(0, 2), on),
      null,
    );
  });
  it("offers nothing once the board is over or the hint is used", () => {
    assert.equal(
      hintOffer("classic", ATTRIBUTES, answer, rows, { ...on, over: true }),
      null,
    );
    assert.equal(
      hintOffer("classic", ATTRIBUTES, answer, rows, { ...on, used: true }),
      null,
    );
  });
  it("offers nothing outside Classic games", () => {
    assert.equal(hintOffer("blur", ATTRIBUTES, answer, rows, on), null);
  });
});
