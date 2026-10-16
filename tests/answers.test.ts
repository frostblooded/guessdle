import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ANSWER_START,
  dayNumber,
  drawAnswer,
  todayIn,
} from "../src/server/answers.ts";

const IDS = ["a", "b", "c", "d", "e", "f", "g", "h"];

describe("dayNumber", () => {
  it("is 0 on the start date and counts calendar days", () => {
    assert.equal(dayNumber(ANSWER_START), 0);
    assert.equal(dayNumber("2025-08-16"), 1);
    assert.equal(dayNumber("2026-08-15"), 365);
    assert.equal(dayNumber("2026-10-16"), 427);
  });

  it("is negative before the start date", () => {
    assert.equal(dayNumber("2025-08-14"), -1);
  });
});

describe("todayIn", () => {
  it("uses the calendar date of the time zone, not of UTC", () => {
    const now = new Date("2026-01-01T22:30:00Z");
    assert.equal(todayIn(now, "Europe/Sofia"), "2026-01-02");
    assert.equal(todayIn(now, "UTC"), "2026-01-01");
    assert.equal(todayIn(now, "America/New_York"), "2026-01-01");
  });

  it("follows daylight saving time", () => {
    const now = new Date("2026-07-01T21:30:00Z");
    assert.equal(todayIn(now, "Europe/Sofia"), "2026-07-02");
  });

  it("rolls over at the local midnight", () => {
    assert.equal(
      todayIn(new Date("2026-03-10T21:59:59Z"), "Europe/Sofia"),
      "2026-03-10",
    );
    assert.equal(
      todayIn(new Date("2026-03-10T22:00:00Z"), "Europe/Sofia"),
      "2026-03-11",
    );
  });
});

describe("drawAnswer", () => {
  it("draws uniformly from the pets not among the previous answers", () => {
    assert.equal(
      drawAnswer(IDS, ["a", "b"], 5, () => 0),
      "c",
    );
    assert.equal(
      drawAnswer(IDS, ["a", "b"], 5, () => 0.999),
      "h",
    );
    assert.equal(
      drawAnswer(IDS, ["a", "b"], 5, () => 0.5),
      "f",
    );
  });

  it("only avoids the last skip-period answers", () => {
    const previous = ["a", "b", "c", "d", "e", "f"];
    // "a" is 6 answers back, so it is allowed again with a skip period of 5
    assert.equal(
      drawAnswer(IDS, previous, 5, () => 0),
      "a",
    );
  });

  it("clamps the skip period to leave at least one pet", () => {
    const previous = ["a", "b", "c", "d", "e", "f", "g"];
    assert.equal(
      drawAnswer(IDS, previous, 50, () => 0.5),
      "h",
    );
  });

  it("returns the only pet of a one-pet roster", () => {
    assert.equal(
      drawAnswer(["solo"], ["solo"], 5, () => 0.7),
      "solo",
    );
  });

  it("ignores previous answers that are no longer in the roster", () => {
    assert.equal(
      drawAnswer(IDS, ["gone", "a"], 5, () => 0),
      "b",
    );
  });

  it("throws on an empty roster", () => {
    assert.throws(() => drawAnswer([], [], 5, () => 0));
  });

  it("never repeats inside the window over a long run", () => {
    let n = 0;
    const random = (): number => (n += 0.37) % 1;
    const seq: string[] = [];
    for (let i = 0; i < 500; i++) {
      seq.push(drawAnswer(IDS, seq, 5, random));
    }
    for (let i = 5; i < seq.length; i++) {
      assert.ok(!seq.slice(i - 5, i).includes(seq[i]!), `day ${i}`);
    }
  });
});
