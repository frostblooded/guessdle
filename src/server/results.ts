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
  const { rows } = await q.query<WinResult & { player: string }>(
    "select player, guesses, seconds from game_results where game_id = $1 and day = $2",
    [gameId, date],
  );
  const mine = rows.find((row) => row.player === player);
  const results = rows.map(({ guesses, seconds }) => ({ guesses, seconds }));
  return summarize(
    day,
    results,
    mine ? { guesses: mine.guesses, seconds: mine.seconds } : null,
  );
}
