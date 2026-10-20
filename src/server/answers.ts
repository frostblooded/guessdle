// Stored Daily Answers: one row per calendar date in the server time zone.
import type pg from "pg";
import type { GameRow } from "./games.ts";
import { loadRoster, skipOf } from "./games.ts";
import { dateOfDay } from "../game/date.ts";
import { forgetDay } from "./day-rows.ts";

const LOCK_KEY = 5_150_002; // arbitrary; serialises answer generation per game across API replicas
const DAY_MS = 86_400_000;

const utcMs = (date: string): number => Date.parse(`${date}T00:00:00Z`);

// Whole calendar days from the game's start date to `date` ("YYYY-MM-DD")
export function dayNumber(date: string, start: string): number {
  return Math.round((utcMs(date) - utcMs(start)) / DAY_MS);
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

// A Sequence game's day (ADR 0020): the oldest entry never an answer before (lowest id) and
// not scheduled later, else a draw as above among the entries not scheduled later (all of them
// if every one is).
export function drawSequenceAnswer(
  ids: readonly number[],
  used: ReadonlySet<number>,
  reserved: ReadonlySet<number>,
  previous: readonly number[],
  skipPeriod: number,
  random: () => number,
): number {
  const fresh = ids.filter((id) => !used.has(id) && !reserved.has(id));
  if (fresh.length > 0) {
    return Math.min(...fresh);
  }
  const free = ids.filter((id) => !reserved.has(id));
  return drawAnswer(free.length > 0 ? free : ids, previous, skipPeriod, random);
}

type Client = Pick<pg.PoolClient, "query">;

// Takes the game's answer lock in `tx`, held until that transaction ends
async function lockAnswers(tx: Client, game: GameRow): Promise<void> {
  await tx.query("select pg_advisory_xact_lock($1, $2)", [LOCK_KEY, game.id]);
}

// Runs `work` in a transaction holding the game's answer lock, so generation,
// overrides and re-draws never interleave.
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

// What a draw looks back on: the previous `skip period` answers (entry ids), oldest first, and
// every entry ever an answer (`used`, Sequence games only)
interface Past {
  previous: number[];
  used: Set<number>;
}

// The game's stored history (only days before `before` when given), and the Day Number of the
// newest day, -1 if none.
async function history(
  client: Client,
  game: GameRow,
  before: string | null,
): Promise<Past & { lastDay: number }> {
  const recent = await client.query<{ day: string; entry_id: number }>(
    `select to_char(day, 'YYYY-MM-DD') as day, entry_id::int from daily_answers
     where game_id = $1 and ($2::date is null or day < $2) order by day desc limit $3`,
    [game.id, before, skipOf(game)],
  );
  const used =
    game.kind === "sequence"
      ? await client.query<{ entry_id: number }>(
          `select distinct entry_id::int from daily_answers
           where game_id = $1 and ($2::date is null or day < $2)`,
          [game.id, before],
        )
      : { rows: [] };
  return {
    previous: recent.rows.map((row) => row.entry_id).reverse(),
    used: new Set(used.rows.map((row) => row.entry_id)),
    lastDay: recent.rows[0]
      ? dayNumber(recent.rows[0].day, game.startDate)
      : -1,
  };
}

// Draws the next answer after `past` and adds it there. `reserved`: entries a Sequence game
// has scheduled on later days.
function drawNext(
  game: GameRow,
  ids: readonly number[],
  past: Past,
  random: () => number,
  reserved: ReadonlySet<number> = new Set(),
): number {
  const entryId =
    game.kind === "sequence"
      ? drawSequenceAnswer(
          ids,
          past.used,
          reserved,
          past.previous,
          skipOf(game),
          random,
        )
      : drawAnswer(ids, past.previous, skipOf(game), random);
  record(past, entryId);
  return entryId;
}

const record = (past: Past, entryId: number): void => {
  past.previous.push(entryId);
  past.used.add(entryId);
};

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
  const past = await history(client, game, null);
  for (let day = past.lastDay + 1; day <= target; day++) {
    await client.query(
      "insert into daily_answers (game_id, day, entry_id, source) values ($1, $2, $3, 'generated')",
      [
        game.id,
        dateOfDay(day, game.startDate),
        drawNext(game, ids, past, random),
      ],
    );
  }
}

// The entry stored for `date`, null when unstored
async function storedEntry(
  client: Client,
  game: GameRow,
  date: string,
): Promise<number | null> {
  const { rows } = await client.query<{ entry_id: number }>(
    "select entry_id::int from daily_answers where game_id = $1 and day = $2",
    [game.id, date],
  );
  return rows[0]?.entry_id ?? null;
}

// After `date`'s answer changed from `before`: if players could have played it (it was
// stored) and it is now another entry, everyone starts that day over. Its guesses,
// give-ups, Free Hints and results go, and the revision tells browsers to drop their boards.
async function restartIfChanged(
  client: Client,
  game: GameRow,
  date: string,
  before: number | null,
): Promise<void> {
  if (before === null || before === (await storedEntry(client, game, date))) {
    return;
  }
  await client.query(
    "update daily_answers set revision = revision + 1 where game_id = $1 and day = $2",
    [game.id, date],
  );
  await forgetDay(client, game.id, date);
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
  const past = await history(client, game, fromDate);
  const later = await client.query<{
    day: string;
    entry_id: number;
    source: string;
  }>(
    `select to_char(day, 'YYYY-MM-DD') as day, entry_id::int, source from daily_answers
     where game_id = $1 and day >= $2 order by day`,
    [game.id, fromDate],
  );
  for (const [i, row] of later.rows.entries()) {
    if (row.source === "override") {
      record(past, row.entry_id);
    } else {
      const reserved = new Set(
        later.rows
          .slice(i + 1)
          .filter((r) => r.source === "override")
          .map((r) => r.entry_id),
      );
      await client.query(
        "update daily_answers set entry_id = $3 where game_id = $1 and day = $2",
        [game.id, row.day, drawNext(game, ids, past, random, reserved)],
      );
    }
  }
}

export interface DayAnswer {
  entryId: number;
  // Bumped each time the answer changed after the day was stored (migration 018)
  revision: number;
}

// The answer stored for `date`. If it is missing, first generates every
// missing day up to it, in order, in one transaction under the game's advisory
// lock, so concurrent first requests store one answer. Null only for a date
// before the start.
export async function ensureAnswer(
  pool: pg.Pool,
  game: GameRow,
  ids: readonly number[],
  date: string,
  random: () => number,
): Promise<DayAnswer | null> {
  const select =
    'select entry_id::int as "entryId", revision from daily_answers where game_id = $1 and day = $2';
  const stored = await pool.query<DayAnswer>(select, [game.id, date]);
  if (stored.rows[0]) {
    return stored.rows[0];
  }
  return locked(pool, game, async (client) => {
    await fillThrough(
      client,
      game,
      ids,
      dayNumber(date, game.startDate),
      random,
    );
    const result = await client.query<DayAnswer>(select, [game.id, date]);
    return result.rows[0] ?? null;
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
// day fills the gap first. Later non-override days are re-drawn; in a Sequence game every one
// after `today`, so no earlier day keeps the entry the owner scheduled. A changed answer
// restarts the day for everyone.
export function setOverride(
  pool: pg.Pool,
  game: GameRow,
  ids: readonly number[],
  date: string,
  entryId: number,
  random: () => number,
  today: string,
): Promise<void> {
  return locked(pool, game, async (client) => {
    const day = dayNumber(date, game.startDate);
    const before = await storedEntry(client, game, date);
    await fillThrough(client, game, ids, day - 1, random);
    await client.query(
      `insert into daily_answers (game_id, day, entry_id, source) values ($1, $2, $3, 'override')
       on conflict (game_id, day) do update set entry_id = excluded.entry_id, source = 'override'`,
      [game.id, date, entryId],
    );
    await restartIfChanged(client, game, date, before);
    const from =
      game.kind === "sequence" ? dayNumber(today, game.startDate) : day;
    await redrawFrom(
      client,
      game,
      ids,
      dateOfDay(from + 1, game.startDate),
      random,
    );
  });
}

// Turns an override back into a generated answer; false when `date` is not an override.
// A re-drawn answer that differs restarts the day for everyone.
export function clearOverride(
  pool: pg.Pool,
  game: GameRow,
  ids: readonly number[],
  date: string,
  random: () => number,
): Promise<boolean> {
  return locked(pool, game, async (client) => {
    const before = await storedEntry(client, game, date);
    const { rowCount } = await client.query(
      "update daily_answers set source = 'generated' where game_id = $1 and day = $2 and source = 'override'",
      [game.id, date],
    );
    if (rowCount === 0) {
      return false;
    }
    await redrawFrom(client, game, ids, date, random);
    await restartIfChanged(client, game, date, before);
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

// After a Sequence game's entries or photo count changed (ADR 0020): overrides after `today`
// whose entry can no longer be the answer are cleared, and every generated day after `today` is
// re-drawn over the entries that may be the answer, so a newly complete entry comes up next.
// Today and the past stay. Other kinds keep their schedule.
export async function rescheduleFuture(
  tx: Client,
  game: GameRow,
  today: string,
  random: () => number,
): Promise<void> {
  if (game.kind !== "sequence") {
    return;
  }
  await lockAnswers(tx, game);
  const ids = (await loadRoster(tx, game)).answerIds;
  await tx.query(
    `update daily_answers set source = 'generated'
     where game_id = $1 and day > $2 and source = 'override' and not (entry_id = any($3::bigint[]))`,
    [game.id, today, ids],
  );
  if (ids.length > 0) {
    await redrawFrom(
      tx,
      game,
      ids,
      dateOfDay(dayNumber(today, game.startDate) + 1, game.startDate),
      random,
    );
  }
}
