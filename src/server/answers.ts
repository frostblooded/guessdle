// Stored Daily Answers: one row per calendar date in the server time zone.
import type pg from "pg";
import type { GameRow } from "./games.ts";
import { skipOf } from "./games.ts";
import { dateOfDay } from "../game/date.ts";

const LOCK_KEY = 5_150_002; // arbitrary; serialises answer generation per game across API replicas
const DAY_MS = 86_400_000;

const utcMs = (date: string): number => Date.parse(`${date}T00:00:00Z`);

// Whole calendar days from the game's start date to `date` ("YYYY-MM-DD")
export function dayNumber(date: string, start: string): number {
  return Math.round((utcMs(date) - utcMs(start)) / DAY_MS);
}

export { dateOfDay };

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
// answers (clamped so at least one entry stays allowed).
export function drawAnswer<T>(
  ids: readonly T[],
  previous: readonly T[],
  skipPeriod: number,
  random: () => number,
): T {
  if (ids.length === 0) {
    throw new Error("empty roster");
  }
  const skip = Math.min(skipPeriod, ids.length - 1);
  const forbidden = skip > 0 ? previous.slice(-skip) : [];
  const allowed = ids.filter((id) => !forbidden.includes(id));
  return allowed[Math.floor(random() * allowed.length)]!;
}

type Client = Pick<pg.PoolClient, "query">;

// Runs `work` in a transaction holding the game's answer lock, so generation,
// overrides and re-draws never interleave.
// Takes the game's answer lock in `tx`, held until that transaction ends
async function lockAnswers(tx: Client, game: GameRow): Promise<void> {
  await tx.query("select pg_advisory_xact_lock($1, $2)", [LOCK_KEY, game.id]);
}

async function locked<T>(
  pool: pg.Pool,
  game: GameRow,
  work: (client: Client) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await lockAnswers(client, game);
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

// The game's previous `skip period` stored answers (entry ids), oldest first
// (only those before `before` when given), and the Day Number of the newest, -1
// if none.
async function history(
  client: Client,
  game: GameRow,
  before: string | null,
): Promise<{ previous: number[]; lastDay: number }> {
  const recent = await client.query<{ day: string; entry_id: number }>(
    `select to_char(day, 'YYYY-MM-DD') as day, entry_id::int from daily_answers
     where game_id = $1 and ($2::date is null or day < $2) order by day desc limit $3`,
    [game.id, before, skipOf(game)],
  );
  return {
    previous: recent.rows.map((row) => row.entry_id).reverse(),
    lastDay: recent.rows[0]
      ? dayNumber(recent.rows[0].day, game.startDate)
      : -1,
  };
}

// Draws the next answer after `previous` and appends it there
function drawNext(
  game: GameRow,
  ids: readonly number[],
  previous: number[],
  random: () => number,
): number {
  const entryId = drawAnswer(ids, previous, skipOf(game), random);
  previous.push(entryId);
  return entryId;
}

// Generates every missing day up to Day Number `target`, in order, each avoiding the
// previous stored answers (overrides included). The one generation path for
// players and the answers peek.
async function fillThrough(
  client: Client,
  game: GameRow,
  ids: readonly number[],
  target: number,
  random: () => number,
): Promise<void> {
  const { previous, lastDay } = await history(client, game, null);
  for (let day = lastDay + 1; day <= target; day++) {
    await client.query(
      "insert into daily_answers (game_id, day, entry_id, source) values ($1, $2, $3, 'generated')",
      [
        game.id,
        dateOfDay(day, game.startDate),
        drawNext(game, ids, previous, random),
      ],
    );
  }
}

// Re-draws every non-override day from `fromDate` on, in order, over the stored
// history before it; overrides stay and count as history.
async function redrawFrom(
  client: Client,
  game: GameRow,
  ids: readonly number[],
  fromDate: string,
  random: () => number,
): Promise<void> {
  const { previous } = await history(client, game, fromDate);
  const later = await client.query<{
    day: string;
    entry_id: number;
    source: string;
  }>(
    `select to_char(day, 'YYYY-MM-DD') as day, entry_id::int, source from daily_answers
     where game_id = $1 and day >= $2 order by day`,
    [game.id, fromDate],
  );
  for (const row of later.rows) {
    if (row.source === "override") {
      previous.push(row.entry_id);
    } else {
      await client.query(
        "update daily_answers set entry_id = $3 where game_id = $1 and day = $2",
        [game.id, row.day, drawNext(game, ids, previous, random)],
      );
    }
  }
}

// The entry id stored for `date`. If it is missing, first generates every
// missing day up to it, in order, in one transaction under the game's advisory
// lock, so concurrent first requests store one answer. Null only for a date
// before the start.
export async function ensureAnswer(
  pool: pg.Pool,
  game: GameRow,
  ids: readonly number[],
  date: string,
  random: () => number,
): Promise<number | null> {
  const select =
    "select entry_id::int from daily_answers where game_id = $1 and day = $2";
  const stored = await pool.query<{ entry_id: number }>(select, [
    game.id,
    date,
  ]);
  if (stored.rows[0]) {
    return stored.rows[0].entry_id;
  }
  return locked(pool, game, async (client) => {
    await fillThrough(
      client,
      game,
      ids,
      dayNumber(date, game.startDate),
      random,
    );
    const result = await client.query<{ entry_id: number }>(select, [
      game.id,
      date,
    ]);
    return result.rows[0]?.entry_id ?? null;
  });
}

export interface StoredDay {
  date: string;
  entryId: number;
  source: "generated" | "override";
  // The previous `skip period` stored answers, oldest first
  previous: number[];
}

// Answers peek: stored days from..to (dates, inclusive), generating whatever is
// missing up to `to` first.
export async function peekDays(
  pool: pg.Pool,
  game: GameRow,
  ids: readonly number[],
  from: string,
  to: string,
  random: () => number,
): Promise<StoredDay[]> {
  await ensureAnswer(pool, game, ids, to, random);
  const { rows } = await pool.query<{
    date: string;
    entry_id: number;
    source: "generated" | "override";
    previous: number[];
  }>(
    `select to_char(day, 'YYYY-MM-DD') as date, entry_id::int, source,
       array(select p.entry_id::int from daily_answers p
             where p.game_id = d.game_id and p.day < d.day order by p.day desc limit $4) as previous
     from daily_answers d where game_id = $1 and day between $2 and $3 order by day`,
    [game.id, from, to, skipOf(game)],
  );
  return rows.map((row) => ({
    date: row.date,
    entryId: row.entry_id,
    source: row.source,
    previous: row.previous.reverse(),
  }));
}

// Overrides `date` (today or later; the caller checks) with `entryId`. An unstored
// day fills the gap first. Later non-override days are re-drawn.
export function setOverride(
  pool: pg.Pool,
  game: GameRow,
  ids: readonly number[],
  date: string,
  entryId: number,
  random: () => number,
): Promise<void> {
  return locked(pool, game, async (client) => {
    const day = dayNumber(date, game.startDate);
    await fillThrough(client, game, ids, day - 1, random);
    await client.query(
      `insert into daily_answers (game_id, day, entry_id, source) values ($1, $2, $3, 'override')
       on conflict (game_id, day) do update set entry_id = excluded.entry_id, source = 'override'`,
      [game.id, date, entryId],
    );
    await redrawFrom(
      client,
      game,
      ids,
      dateOfDay(day + 1, game.startDate),
      random,
    );
  });
}

// Turns an override back into a generated answer; false when `date` is not an override.
export function clearOverride(
  pool: pg.Pool,
  game: GameRow,
  ids: readonly number[],
  date: string,
  random: () => number,
): Promise<boolean> {
  return locked(pool, game, async (client) => {
    const { rowCount } = await client.query(
      "update daily_answers set source = 'generated' where game_id = $1 and day = $2 and source = 'override'",
      [game.id, date],
    );
    if (rowCount === 0) {
      return false;
    }
    await redrawFrom(client, game, ids, date, random);
    return true;
  });
}

// After an entry is soft-deleted: overrides after today pointing at it are cleared and every
// stored day after today that pointed at it is re-drawn over the `ids` that remain.
// Today and the past keep their answer (players saw it; the soft-deleted row still resolves).
// Runs in the deleting transaction `tx`, so the delete and the re-draw land together.
export async function releaseEntry(
  tx: Client,
  game: GameRow,
  ids: readonly number[],
  today: string,
  entryId: number,
  random: () => number,
): Promise<void> {
  await lockAnswers(tx, game);
  const cleared = await tx.query<{ day: string }>(
    `update daily_answers set source = 'generated'
     where game_id = $1 and entry_id = $2 and day > $3 and source = 'override'
     returning to_char(day, 'YYYY-MM-DD') as day`,
    [game.id, entryId, today],
  );
  const stale = await tx.query<{ day: string | null }>(
    `select to_char(min(day), 'YYYY-MM-DD') as day from daily_answers
     where game_id = $1 and entry_id = $2 and day > $3`,
    [game.id, entryId, today],
  );
  const days = [...cleared.rows.map((r) => r.day), stale.rows[0]!.day]
    .filter((d): d is string => d !== null)
    .sort();
  if (days[0] !== undefined && ids.length > 0) {
    await redrawFrom(tx, game, ids, days[0], random);
  }
}

// After the skip period changed: re-draws every stored generated day after `today`
// under the game's new rule. Today and the past stay as players saw them. Runs in the editing
// transaction `tx`.
export async function redrawFuture(
  tx: Client,
  game: GameRow,
  ids: readonly number[],
  today: string,
  random: () => number,
): Promise<void> {
  await lockAnswers(tx, game);
  await redrawFrom(
    tx,
    game,
    ids,
    dateOfDay(dayNumber(today, game.startDate) + 1, game.startDate),
    random,
  );
}
