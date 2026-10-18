import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { SKIP } from "../src/game/game.ts";
import type { GameRow, Roster } from "../src/server/games.ts";
import { boardOf, dayOf } from "../src/server/play-day.ts";
import { ATTRIBUTES, GUESS_DATA } from "./roster-fixture.ts";

const classic = {
  id: 1,
  kind: "classic",
  blurTries: 3,
  startDate: "2026-10-10",
} as GameRow;
const blur = { ...classic, kind: "blur" } as GameRow;
const roster = {
  attributes: ATTRIBUTES,
  entries: GUESS_DATA,
  all: GUESS_DATA,
  incomplete: 0,
} as Roster;
const answer = GUESS_DATA[0]!;
const [, one, two, three] = GUESS_DATA.map((e) => e.id);
const day = (game: GameRow) => ({ game, roster, answer });

describe("dayOf", () => {
  const clock = {
    now: () => new Date("2026-10-16T10:00:00Z"),
    timeZone: "Europe/Sofia",
  };
  it("is today without a day, and any Day Number up to today", () => {
    assert.deepEqual(dayOf(clock, classic, undefined), {
      date: "2026-10-16",
      day: 6,
      past: false,
    });
    assert.deepEqual(dayOf(clock, classic, "0"), {
      date: "2026-10-10",
      day: 0,
      past: true,
    });
    assert.deepEqual(dayOf(clock, classic, "6"), {
      date: "2026-10-16",
      day: 6,
      past: false,
    });
  });
  it("has no day after today, nor one that is not a whole number", () => {
    for (const raw of ["7", "-1", "1.5", "x", "", "1234567", ["1"]]) {
      assert.equal(dayOf(clock, classic, raw), null, JSON.stringify(raw));
    }
  });
});

describe("boardOf", () => {
  it("reveals the answer only once the day is won or given up", () => {
    const playing = boardOf(day(classic), [one!, two!]);
    assert.ok(typeof playing === "object");
    assert.equal(playing.victory, false);
    assert.equal(playing.reveal, null);
    assert.equal(playing.rows.length, 2);

    const won = boardOf(day(classic), [one!, answer.id]);
    assert.ok(typeof won === "object");
    assert.deepEqual(won.reveal, { answer: answer.name });

    const gaveUp = boardOf(day(classic), [one!], true);
    assert.ok(typeof gaveUp === "object");
    assert.deepEqual(gaveUp.reveal, { answer: answer.name });
  });

  it("a Blur day is lost on its last try, and shows the whole image", () => {
    const lost = boardOf(day(blur), [one!, SKIP, two!]);
    assert.ok(typeof lost === "object");
    assert.equal(lost.lost, true);
    assert.deepEqual(lost.reveal, {
      answer: answer.name,
      answerPhoto: answer.photo,
    });
    const playing = boardOf(day(blur), [one!, SKIP]);
    assert.ok(typeof playing === "object");
    assert.equal(playing.lost, false);
    assert.equal(playing.reveal, null);
  });

  it("refuses unknown and repeated guesses; only a Blur game skips", () => {
    assert.equal(boardOf(day(classic), [999]), "invalid");
    assert.equal(boardOf(day(classic), [SKIP]), "invalid");
    assert.equal(boardOf(day(classic), [three!, three!]), "duplicate");
    assert.equal(typeof boardOf(day(blur), [SKIP, SKIP]), "object");
  });
});
