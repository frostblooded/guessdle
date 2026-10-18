import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { dateOfDay } from "../src/game/date.ts";
import { dayLabel, dayPath, localStatus, statusOf } from "../src/game/days.ts";

describe("statusOf", () => {
  const none = { won: false, gaveUp: false, guesses: 0 };
  it("a win beats a give-up beats guesses", () => {
    assert.equal(statusOf({ won: true, gaveUp: true, guesses: 3 }), "won");
    assert.equal(statusOf({ ...none, gaveUp: true, guesses: 3 }), "gave-up");
    assert.equal(statusOf({ ...none, guesses: 1 }), "playing");
    assert.equal(statusOf(none), "unplayed");
  });
});

describe("localStatus", () => {
  it("reads the browser's Game State", () => {
    const state = (won: boolean, gaveUp: boolean, ids: number[]) => ({
      getWon: () => won,
      getGaveUp: () => gaveUp,
      getUsedGuesses: () => ids,
    });
    assert.equal(localStatus(state(true, false, [1])), "won");
    assert.equal(localStatus(state(false, true, [])), "gave-up");
    assert.equal(localStatus(state(false, false, [1, 2])), "playing");
    assert.equal(localStatus(state(false, false, [])), "unplayed");
  });
});

describe("dates", () => {
  it("dateOfDay counts calendar days from day 0, across months and DST", () => {
    assert.equal(dateOfDay(0, "2025-08-15"), "2025-08-15");
    assert.equal(dateOfDay(427, "2025-08-15"), "2026-10-16");
    assert.equal(dateOfDay(80, "2026-03-01"), "2026-05-20");
  });

  it("dayLabel names the calendar day without a time zone shift", () => {
    assert.equal(dayLabel("2026-10-16"), "Fri 16 Oct 2026");
    assert.equal(dayLabel("2026-01-01"), "Thu 1 Jan 2026");
  });

  it("dayPath sends today to the game's own page", () => {
    assert.equal(dayPath("pets", 5, 5), "/g/pets");
    assert.equal(dayPath("pets", 3, 5), "/g/pets/day/3");
    assert.equal(dayPath("a b", 3, 5), "/g/a%20b/day/3");
  });
});
