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

type Client = Pick<pg.PoolClient, "query">;

// Runs `work` in a transaction holding the answer lock, so generation, overrides
// and re-draws never interleave.
async function locked<T>(
  pool: pg.Pool,
  work: (client: Client) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock($1)", [LOCK_KEY]);
    const out = await work(client);
    await client.query("commit");
    return out;
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}

// Generates every missing day up to Day Number `target`, in order, each avoiding the
// previous stored answers (overrides included). The one generation path for
// players and the admin peek.
async function fillThrough(
  client: Client,
  ids: readonly string[],
  target: number,
  random: () => number,
): Promise<void> {
  const recent = await client.query<{ day: string; pet_id: string }>(
    "select to_char(day, 'YYYY-MM-DD') as day, pet_id from daily_answers order by day desc limit $1",
    [ANSWER_SKIP_PERIOD],
  );
  const previous = recent.rows.map((row) => row.pet_id).reverse();
  const lastDay = recent.rows[0] ? dayNumber(recent.rows[0].day) : -1;
  for (let day = lastDay + 1; day <= target; day++) {
    const petId = drawAnswer(ids, previous, ANSWER_SKIP_PERIOD, random);
    await client.query(
      "insert into daily_answers (day, pet_id, source) values ($1, $2, 'generated')",
      [dateOfDay(day), petId],
    );
    previous.push(petId);
  }
}

// Re-draws every non-override day from `fromDate` on, in order, over the stored
// history before it; overrides stay and count as history.
async function redrawFrom(
  client: Client,
  ids: readonly string[],
  fromDate: string,
  random: () => number,
): Promise<void> {
  const before = await client.query<{ pet_id: string }>(
    "select pet_id from daily_answers where day < $1 order by day desc limit $2",
    [fromDate, ANSWER_SKIP_PERIOD],
  );
  const previous = before.rows.map((row) => row.pet_id).reverse();
  const later = await client.query<{
    day: string;
    pet_id: string;
    source: string;
  }>(
    "select to_char(day, 'YYYY-MM-DD') as day, pet_id, source from daily_answers where day >= $1 order by day",
    [fromDate],
  );
  for (const row of later.rows) {
    let petId = row.pet_id;
    if (row.source !== "override") {
      petId = drawAnswer(ids, previous, ANSWER_SKIP_PERIOD, random);
      await client.query(
        "update daily_answers set pet_id = $2 where day = $1",
        [row.day, petId],
      );
    }
    previous.push(petId);
  }
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
  return locked(pool, async (client) => {
    await fillThrough(client, ids, dayNumber(date), random);
    const result = await client.query<{ pet_id: string }>(select, [date]);
    return result.rows[0]?.pet_id ?? null;
  });
}

export interface StoredDay {
  date: string;
  petId: string;
  source: "generated" | "override";
  // The previous `ANSWER_SKIP_PERIOD` stored answers, oldest first
  previous: string[];
}

// Admin peek: stored days from..to (dates, inclusive), generating whatever is
// missing up to `to` first.
export async function peekDays(
  pool: pg.Pool,
  ids: readonly string[],
  from: string,
  to: string,
  random: () => number,
): Promise<StoredDay[]> {
  await ensureAnswer(pool, ids, to, random);
  const { rows } = await pool.query<{
    date: string;
    pet_id: string;
    source: "generated" | "override";
    previous: string[];
  }>(
    `select to_char(day, 'YYYY-MM-DD') as date, pet_id, source,
       array(select p.pet_id from daily_answers p
             where p.day < d.day order by p.day desc limit $3) as previous
     from daily_answers d where day between $1 and $2 order by day`,
    [from, to, ANSWER_SKIP_PERIOD],
  );
  return rows.map((row) => ({
    date: row.date,
    petId: row.pet_id,
    source: row.source,
    previous: row.previous.reverse(),
  }));
}

// Overrides `date` (today or later; the caller checks) with `petId`. An unstored
// day fills the gap first. Later non-override days are re-drawn.
export function setOverride(
  pool: pg.Pool,
  ids: readonly string[],
  date: string,
  petId: string,
  random: () => number,
): Promise<void> {
  return locked(pool, async (client) => {
    await fillThrough(client, ids, dayNumber(date) - 1, random);
    await client.query(
      `insert into daily_answers (day, pet_id, source) values ($1, $2, 'override')
       on conflict (day) do update set pet_id = excluded.pet_id, source = 'override'`,
      [date, petId],
    );
    await redrawFrom(client, ids, dateOfDay(dayNumber(date) + 1), random);
  });
}

// Turns an override back into a generated answer; false when `date` is not an override.
export function clearOverride(
  pool: pg.Pool,
  ids: readonly string[],
  date: string,
  random: () => number,
): Promise<boolean> {
  return locked(pool, async (client) => {
    const { rowCount } = await client.query(
      "update daily_answers set source = 'generated' where day = $1 and source = 'override'",
      [date],
    );
    if (rowCount === 0) {
      return false;
    }
    await redrawFrom(client, ids, date, random);
    return true;
  });
}
