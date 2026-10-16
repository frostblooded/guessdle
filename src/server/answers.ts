// Stored Daily Answers: one row per calendar date in the server time zone.
import type pg from "pg";
import { ANSWER_SKIP_PERIOD } from "../game/roster.ts";

// Day Number 0
export const ANSWER_START = "2025-08-15";

const LOCK_KEY = 5_150_002; // arbitrary; serialises answer generation across API replicas
const DAY_MS = 86_400_000;

const utcMs = (date: string): number => Date.parse(`${date}T00:00:00Z`);

// Whole calendar days from the start date to `date` ("YYYY-MM-DD")
export function dayNumber(date: string): number {
  return Math.round((utcMs(date) - utcMs(ANSWER_START)) / DAY_MS);
}

export function dateOfDay(day: number): string {
  return new Date(utcMs(ANSWER_START) + day * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

// The calendar date ("YYYY-MM-DD") it is right now in `timeZone`
export function todayIn(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

// One day's answer: uniform over the roster minus the previous `skipPeriod`
// answers (clamped so at least one pet stays allowed).
export function drawAnswer(
  ids: readonly string[],
  previous: readonly string[],
  skipPeriod: number,
  random: () => number,
): string {
  if (ids.length === 0) {
    throw new Error("empty roster");
  }
  const skip = Math.min(skipPeriod, ids.length - 1);
  const forbidden = skip > 0 ? previous.slice(-skip) : [];
  const allowed = ids.filter((id) => !forbidden.includes(id));
  return allowed[Math.floor(random() * allowed.length)]!;
}

// The pet id stored for `date`. If it is missing, first generates every
// missing day up to it, in order, in one transaction under an advisory lock, so
// concurrent first requests store one answer. Null only for a date before the start.
export async function ensureAnswer(
  pool: pg.Pool,
  ids: readonly string[],
  date: string,
  random: () => number,
): Promise<string | null> {
  const select = "select pet_id from daily_answers where day = $1";
  const stored = await pool.query<{ pet_id: string }>(select, [date]);
  if (stored.rows[0]) {
    return stored.rows[0].pet_id;
  }

  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock($1)", [LOCK_KEY]);
    const recent = await client.query<{ day: string; pet_id: string }>(
      "select to_char(day, 'YYYY-MM-DD') as day, pet_id from daily_answers order by day desc limit $1",
      [ANSWER_SKIP_PERIOD],
    );
    const previous = recent.rows.map((row) => row.pet_id).reverse();
    const lastDay = recent.rows[0] ? dayNumber(recent.rows[0].day) : -1;
    for (let day = lastDay + 1; day <= dayNumber(date); day++) {
      const petId = drawAnswer(ids, previous, ANSWER_SKIP_PERIOD, random);
      await client.query(
        "insert into daily_answers (day, pet_id, source) values ($1, $2, 'generated')",
        [dateOfDay(day), petId],
      );
      previous.push(petId);
    }
    const result = await client.query<{ pet_id: string }>(select, [date]);
    await client.query("commit");
    return result.rows[0]?.pet_id ?? null;
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}
