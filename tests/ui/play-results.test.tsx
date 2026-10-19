import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { gradeGuess, skippedRow } from "../../src/game/game.ts";
import { boardOf } from "../../src/routes/play/play-results.tsx";
import { ATTRIBUTES, GUESS_DATA } from "../roster-fixture.ts";

const [answer, wrong] = GUESS_DATA;
const rows = [
  gradeGuess(ATTRIBUTES, answer!, wrong!),
  gradeGuess(ATTRIBUTES, answer!, answer!),
];

describe("boardOf", () => {
  it("a classic game has columns and unlimited guesses", () => {
    const board = boardOf(
      { kind: "classic", attributes: ATTRIBUTES },
      GUESS_DATA,
      rows,
    );
    assert.equal(board.tries, null);
    assert.equal(board.wrong, 1);
    assert.deepEqual(
      board.titles?.map((c) => c.title),
      ["Name", "Colors", "Owner"],
    );
    assert.deepEqual(board.names, ["Cookie", "Dido", "Eli"]);
  });

  it("a Blur game counts a skip as a wrong try and shows names only", () => {
    const board = boardOf(
      { kind: "blur", blurTries: 4, attributes: ATTRIBUTES },
      GUESS_DATA,
      [skippedRow(), rows[0]!],
    );
    assert.equal(board.tries, 4);
    assert.equal(board.wrong, 2);
    assert.equal(board.titles, null);
    assert.equal(board.unguessed.length, 4);
  });
});
