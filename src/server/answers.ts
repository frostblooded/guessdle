import type pg from "pg";
import type { GameRow } from "./games.ts";
import { loadRoster, skipOf } from "./games.ts";
import { dateOfDay } from "../game/date.ts";
import { forgetDay } from "./day-rows.ts";

const LOCK_KEY = 5_150_002;
const DAY_MS = 86_400_000;

const utcMs = (date: string): number => Date.parse(`${date}T00:00:00Z`);

export function dayNumber(date: string, start: string): number {
  return Math.round((utcMs(date) - utcMs(start)) / DAY_MS);
}

export function todayIn(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

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

interface Past {
  previous: number[];
  used: Set<number>;
}

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
  revision: number;
}

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
  previous: number[];
}

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
