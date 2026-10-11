import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import seedrandom from "seedrandom";
// Node reads TZ lazily, so set it before any Date is built. The DST test
// checks that it took effect rather than trusting it. Dynamic imports, since
// static ones run first and ANSWER_START_DATE is built at import time.
process.env["TZ"] = "America/New_York";
const { ANSWER_START_DATE, generateAnswerSequence, getAnswerSeed, getDayNumber } =
  await import("../answer-sequence.ts");
const { ANSWER_SKIP_PERIOD, GUESS_DATA } = await import("../roster.ts");

interface Golden {
  seed: string;
  rosterLength: number;
  skipPeriod: number;
  answers: number[];
}

const golden: Golden = JSON.parse(
  readFileSync(
    join(import.meta.dirname, "fixtures", "answer-sequence.golden.json"),
    "utf8",
  ),
);

// A day repeating an answer from inside the Skip Period of an earlier day.
function findSkipPeriodViolation(
  answers: number[],
  skipPeriod: number,
): string | null {
  for (let day = 0; day < answers.length; day++) {
    for (let back = 1; back <= skipPeriod && back <= day; back++) {
      if (answers[day] === answers[day - back])
        return `day ${day} repeats the answer of day ${day - back}`;
    }
  }
  return null;
}

function sequence(days: number, seed: string = getAnswerSeed()): number[] {
  return generateAnswerSequence(
    GUESS_DATA.length,
    ANSWER_SKIP_PERIOD,
    days,
    seedrandom(seed),
  );
}

describe("Answer Sequence golden fixture", () => {
  const regenerateHint =
    "The Answer Sequence changed. Roster order or length, the seed or the " +
    "Skip Period was edited, which rewrites every Daily Answer (see " +
    "docs/adr/0002-fixed-seed-answer-sequence.md). If that is intended, " +
    "regenerate tests/fixtures/answer-sequence.golden.json deliberately.";

  it("uses the roster length, Skip Period and seed the fixture records", () => {
    assert.deepEqual(
      {
        seed: getAnswerSeed(),
        rosterLength: GUESS_DATA.length,
        skipPeriod: ANSWER_SKIP_PERIOD,
      },
      {
        seed: golden.seed,
        rosterLength: golden.rosterLength,
        skipPeriod: golden.skipPeriod,
      },
      regenerateHint,
    );
  });

  it("produces the first 60 Daily Answers", () => {
    assert.deepEqual(sequence(60), golden.answers, regenerateHint);
  });
});

describe("generateAnswerSequence", () => {
  it("holds the Skip Period across 2000 consecutive days", () => {
    const answers = sequence(2000, "skip-period");
    assert.equal(answers.length, 2000);
    assert.equal(findSkipPeriodViolation(answers, ANSWER_SKIP_PERIOD), null);
  });

  it("holds the Skip Period on a small roster", () => {
    const answers = generateAnswerSequence(
      4,
      3,
      1500,
      seedrandom("small"),
    );
    assert.equal(findSkipPeriodViolation(answers, 3), null);
    assert.deepEqual([...new Set(answers)].sort(), [0, 1, 2, 3]);
  });

  it("only returns valid roster indices", () => {
    for (const idx of sequence(1000, "indices"))
      assert.ok(Number.isInteger(idx) && idx >= 0 && idx < GUESS_DATA.length);
  });

  it("gives the same answers on every computation", () => {
    assert.deepEqual(sequence(400), sequence(400));
  });

  it("extends a shorter sequence without changing earlier days", () => {
    assert.deepEqual(sequence(100).slice(0, 30), sequence(30));
  });

  it("clamps the Skip Period when the roster is no larger than it", () => {
    for (const rosterSize of [2, 3, 5]) {
      const answers = generateAnswerSequence(
        rosterSize,
        5,
        200,
        seedrandom("clamp"),
      );
      assert.equal(answers.length, 200);
      assert.equal(
        findSkipPeriodViolation(answers, rosterSize - 1),
        null,
        `roster of ${rosterSize}`,
      );
    }
  });

  it("returns the only pet every day for a roster of one", () => {
    const answers = generateAnswerSequence(
      1,
      5,
      10,
      seedrandom("one"),
    );
    assert.deepEqual(answers, new Array(10).fill(0));
  });

  it("returns an empty sequence for no days, negative days or an empty roster", () => {
    const random = seedrandom("empty");
    assert.deepEqual(generateAnswerSequence(19, 5, 0, random), []);
    assert.deepEqual(generateAnswerSequence(19, 5, -3, random), []);
    assert.deepEqual(generateAnswerSequence(0, 5, 10, random), []);
  });

  it("returns the day 0 answer alone for one day", () => {
    assert.deepEqual(sequence(1), [golden.answers[0]]);
  });
});

describe("getDayNumber", () => {
  const dstAvailable =
    new Date(2025, 0, 1).getTimezoneOffset() !==
    new Date(2025, 6, 1).getTimezoneOffset();

  it("is 0 on the start date, however late in the day", () => {
    assert.equal(getDayNumber(ANSWER_START_DATE, ANSWER_START_DATE), 0);
    assert.equal(
      getDayNumber(ANSWER_START_DATE, new Date(2025, 7, 15, 23, 59, 59)),
      0,
    );
  });

  it("is 1 the day after the start date, even a minute past midnight", () => {
    assert.equal(getDayNumber(ANSWER_START_DATE, new Date(2025, 7, 16)), 1);
    assert.equal(
      getDayNumber(ANSWER_START_DATE, new Date(2025, 7, 16, 0, 1)),
      1,
    );
  });

  it("is negative before the start date", () => {
    assert.equal(getDayNumber(ANSWER_START_DATE, new Date(2025, 7, 14)), -1);
    assert.equal(
      getDayNumber(ANSWER_START_DATE, new Date(2025, 7, 14, 23, 59)),
      -1,
    );
  });

  it("counts across month and year boundaries", () => {
    assert.equal(getDayNumber(ANSWER_START_DATE, new Date(2025, 8, 1)), 17);
    assert.equal(getDayNumber(ANSWER_START_DATE, new Date(2026, 7, 15)), 365);
  });

  it("counts one per calendar day across DST changes", (t) => {
    if (!dstAvailable)
      return t.skip("TZ override had no effect on this platform");

    const springStart = new Date(2025, 2, 8); // day before US spring-forward
    assert.equal(getDayNumber(springStart, new Date(2025, 2, 9)), 1); // 23h day
    assert.equal(getDayNumber(springStart, new Date(2025, 2, 10)), 2);
    assert.equal(getDayNumber(springStart, new Date(2025, 2, 9, 23, 59)), 1);

    const fallStart = new Date(2025, 10, 1); // day before US fall-back
    assert.equal(getDayNumber(fallStart, new Date(2025, 10, 2)), 1); // 25h day
    assert.equal(getDayNumber(fallStart, new Date(2025, 10, 3)), 2);
    assert.equal(getDayNumber(fallStart, new Date(2025, 10, 2, 23, 59)), 1);
  });
});
