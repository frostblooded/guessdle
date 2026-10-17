import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "vitest";
import { dayNumber } from "../src/server/answers.ts";

// The roster the backfill was drawn from (the slugs migration 005 rewrites)
const PET_IDS =
  "ati bela cookie dido eddie eli ilko jaro jeffy kiara kimi mochi murlin oreo patio pipi puhche sunny todorka".split(
    " ",
  );
const root = join(import.meta.dirname, "..");
const backfill: Record<string, string> = JSON.parse(
  readFileSync(join(root, "db", "backfill", "answers.json"), "utf8"),
);
const days = Object.keys(backfill).sort();

describe("backfill answers", () => {
  it("covers consecutive days from day 0 with roster pets only", () => {
    days.forEach((day, n) =>
      assert.equal(dayNumber(day, "2025-08-15"), n, day),
    );
    const ids = new Set(PET_IDS);
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
