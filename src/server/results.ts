// Each player's first attempt of the day per game, and the day's stats built from them.
// Only a first attempt that ends in a win counts; a failed one (give-up or out of tries)
// takes the player's row so a win after a reset never does.
import type pg from "pg";
import {
  isPlayerToken,
  summarize,
  type DayStats,
  type WinResult,
} from "../game/stats.ts";

import { friendResults, userIdOf } from "./friends.ts";

type Q = Pick<pg.Pool, "query">;

export interface ResultKey {
  gameId: number;
  date: string;
  // "user:<id>" or "anon:<token>"
  player: string;
}

// The account's player, or the browser's from a request body's token; null for neither
export const playerOf = (
  userId: number | null,
  body: Record<string, unknown>,
): string | null =>
  userId !== null
    ? `user:${userId}`
    : isPlayerToken(body["player"])
      ? `anon:${body["player"]}`
      : null;

// Keeps the first attempt only: a replay after a reset changes nothing
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

// A first attempt that ended without a win; a later win that day does not count
export async function recordFailure(
  q: Q,
  { gameId, date, player }: ResultKey,
  guesses: number,
): Promise<void> {
  await q.query(
    "insert into game_results (game_id, day, player, guesses, won) values ($1, $2, $3, $4, false) on conflict do nothing",
    [gameId, date, player, guesses],
  );
}

export async function dayStats(
  q: Q,
  { gameId, date, player }: ResultKey,
  day: number,
): Promise<DayStats> {
  // A banned player's wins leave the stats while the ban lasts, except in their own view
  const { rows } = await q.query<WinResult & { player: string; won: boolean }>(
    `select r.player, r.guesses, r.seconds, r.won from game_results r
     where r.game_id = $1 and r.day = $2 and (r.player = $3 or not exists (
       select 1 from users u where r.player = 'user:' || u.id and u.banned_at is not null
     ))`,
    [gameId, date, player],
  );
  const mine = rows.find((row) => row.player === player);
  const userId = userIdOf(player);
  const results = rows
    .filter((row) => row.won)
    .map(({ guesses, seconds }) => ({ guesses, seconds }));
  return {
    ...summarize(
      day,
      results,
      mine?.won ? { guesses: mine.guesses, seconds: mine.seconds } : null,
    ),
    ...(mine?.won === false && { firstTryFailed: true as const }),
    ...(userId !== null && {
      friends: await friendResults(q, userId, gameId, date),
    }),
  };
}
