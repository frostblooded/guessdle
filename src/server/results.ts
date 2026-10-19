// Each player's first win of the day per game, and the day's stats built from them.
import type pg from "pg";
import { summarize, type DayStats, type WinResult } from "../game/stats.ts";

type Q = Pick<pg.Pool, "query">;

export interface ResultKey {
  gameId: number;
  date: string;
  // "user:<id>" or "anon:<token>"
  player: string;
}

// Keeps the first win only: a replay after a reset changes nothing
export async function recordResult(
  q: Q,
  { gameId, date, player }: ResultKey,
  result: WinResult,
): Promise<void> {
  await q.query(
    "insert into game_results (game_id, day, player, guesses, seconds) values ($1, $2, $3, $4, $5) on conflict do nothing",
    [gameId, date, player, result.guesses, result.seconds],
  );
}

export async function dayStats(
  q: Q,
  { gameId, date, player }: ResultKey,
  day: number,
): Promise<DayStats> {
  // A banned player's wins leave the stats while the ban lasts, except in their own view
  const { rows } = await q.query<WinResult & { player: string }>(
    `select r.player, r.guesses, r.seconds from game_results r
     where r.game_id = $1 and r.day = $2 and (r.player = $3 or not exists (
       select 1 from users u where r.player = 'user:' || u.id and u.banned_at is not null
     ))`,
    [gameId, date, player],
  );
  const mine = rows.find((row) => row.player === player);
  const results = rows.map(({ guesses, seconds }) => ({ guesses, seconds }));
  return summarize(
    day,
    results,
    mine ? { guesses: mine.guesses, seconds: mine.seconds } : null,
  );
}
