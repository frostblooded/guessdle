import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  gradeGuess,
  type Entry,
  type GameAttribute,
} from "../src/game/game.ts";
import { explainRow, stillFitting } from "../src/game/tutorial.ts";

const ATTRIBUTES: GameAttribute[] = [
  { name: "Photo", type: "image" },
  { name: "Colors", type: "list" },
  { name: "Owner", type: "text" },
  { name: "Age", type: "number" },
];
const pet = (
  id: number,
  name: string,
  colors: string[],
  owner: string,
  age: string,
): Entry => ({
  id,
  name,
  photo: `/p/${id}.webp`,
  values: [`/p/${id}.webp`, colors, owner, age],
});

const ATI = pet(1, "Ati", ["Black", "Orange", "White"], "Niki", "5");
const COOKIE = pet(2, "Cookie", ["Black", "Orange", "White"], "Niki", "3");
const EDDIE = pet(3, "Eddie", ["Orange", "White"], "Stefi", "7");
const BELA = pet(4, "Bela", ["Grey"], "Beti", "5");
const ROSTER = [ATI, COOKIE, EDDIE, BELA];
const row = (guess: Entry) => gradeGuess(ATTRIBUTES, ATI, guess);

describe("explainRow", () => {
  it("says what each color means for a wrong guess, skipping the picture", () => {
    assert.deepEqual(explainRow(ATTRIBUTES, row(EDDIE)), [
      "Name is red: Eddie is not the secret pet.",
      "Colors is orange: the secret pet has some of Orange, White, but not exactly these.",
      "Owner is red: the secret pet's owner is not Stefi.",
      "Age is red with ↓: the secret pet's age is lower than 7.",
    ]);
  });

  it("explains green cells, a red list and a higher number", () => {
    assert.deepEqual(explainRow(ATTRIBUTES, row(COOKIE)).slice(1), [
      "Colors is green: the secret pet has exactly Black, Orange, White.",
      "Owner is green: the secret pet's owner is Niki.",
      "Age is red with ↑: the secret pet's age is higher than 3.",
    ]);
    assert.equal(
      explainRow(ATTRIBUTES, row(BELA))[1],
      "Colors is red: the secret pet has none of Grey.",
    );
  });

  it("names the secret pet on a correct guess", () => {
    assert.equal(
      explainRow(ATTRIBUTES, row(ATI))[0],
      "Name is green: Ati is the secret pet!",
    );
  });
});

describe("stillFitting", () => {
  it("keeps every pet before any guess", () => {
    assert.deepEqual(stillFitting(ATTRIBUTES, ROSTER, [], []), ROSTER);
  });

  it("keeps only pets that would have colored every guess the same way", () => {
    assert.deepEqual(
      stillFitting(ATTRIBUTES, ROSTER, [BELA], [row(BELA)]).map((p) => p.name),
      ["Ati"],
    );
    assert.deepEqual(
      stillFitting(ATTRIBUTES, ROSTER, [EDDIE], [row(EDDIE)]).map(
        (p) => p.name,
      ),
      ["Ati", "Cookie"],
    );
  });

  it("drops the guessed pet once it is wrong, and keeps only the answer once found", () => {
    assert.deepEqual(
      stillFitting(ATTRIBUTES, ROSTER, [ATI], [row(ATI)]).map((p) => p.name),
      ["Ati"],
    );
  });
});
