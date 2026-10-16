import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import seedrandom from "seedrandom";
import {
  generateAnswerSequence,
  getAnswerSeed,
} from "../src/game/answer-sequence.ts";
import { ANSWER_SKIP_PERIOD, GUESS_DATA } from "../src/game/roster.ts";
import { dayNumber } from "../src/server/answers.ts";

const root = join(import.meta.dirname, "..");
const backfill: Record<string, string> = JSON.parse(
  readFileSync(join(root, "db", "backfill", "answers.json"), "utf8"),
);
const golden: { answers: number[] } = JSON.parse(
  readFileSync(
    join(import.meta.dirname, "fixtures", "answer-sequence.golden.json"),
    "utf8",
  ),
);
const days = Object.keys(backfill).sort();

describe("backfill answers", () => {
  it("equals the first 60 golden entries (transitional, until #42)", () => {
    assert.deepEqual(
      days.slice(0, 60).map((day) => backfill[day]),
      golden.answers.map((idx) => GUESS_DATA[idx]!.id),
    );
  });

  it("equals the old seeded replay for every backfilled day", () => {
    const replay = generateAnswerSequence(
      GUESS_DATA.length,
      ANSWER_SKIP_PERIOD,
      days.length,
      seedrandom(getAnswerSeed()),
    );
    assert.deepEqual(
      days.map((day) => backfill[day]),
      replay.map((idx) => GUESS_DATA[idx]!.id),
    );
  });

  it("covers consecutive days from day 0 with roster pets only", () => {
    days.forEach((day, n) => assert.equal(dayNumber(day), n, day));
    const ids = new Set(GUESS_DATA.map((pet) => pet.id));
    for (const id of Object.values(backfill)) {
      assert.ok(ids.has(id), id);
    }
  });

  it("is what the migration inserts", () => {
    const sql = readFileSync(
      join(root, "db", "migrations", "001_daily_answers.sql"),
      "utf8",
    );
    const literal = /jsonb_each_text\('(\{.*\})'::jsonb\)/.exec(sql)?.[1];
    assert.deepEqual(JSON.parse(literal!), backfill);
  });
});
