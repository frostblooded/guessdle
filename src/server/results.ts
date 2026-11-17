import type pg from "pg";
import {
  isPlayerToken,
  MAX_SECONDS,
  summarize,
  type DayStats,
  type WinResult,
} from "../game/stats.ts";
import { boardOf, type PlayDay } from "./play-day.ts";

import { friendResults, userIdOf } from "./friends.ts";

type Q = Pick<pg.Pool, "query">;

export interface ResultKey {
  gameId: number;
  date: string;
  player: string;
}

export const playerOf = (
  userId: number | null,
  body: Record<string, unknown>,
): string | null =>
  userId !== null
    ? `user:${userId}`
    : isPlayerToken(body["player"])
      ? `anon:${body["player"]}`
      : null;

async function recordResult(
  q: Q,
  { gameId, date, player }: ResultKey,
  result: WinResult,
): Promise<void> {
  await q.query(
    "insert into game_results (game_id, day, player, guesses, seconds) values ($1, $2, $3, $4, $5) on conflict do nothing",
    [gameId, date, player, result.guesses, result.seconds],
  );
}

export async function dropGuestResult(
  q: Q,
  day: Pick<PlayDay, "game" | "date">,
  token: string,
): Promise<void> {
  await q.query(
    "delete from game_results where game_id = $1 and day = $2 and player = $3",
    [day.game.id, day.date, `anon:${token}`],
  );
}

export const knownSeconds = (seconds: unknown): number | null =>
  Number.isInteger(seconds) &&
  (seconds as number) >= 0 &&
  (seconds as number) <= MAX_SECONDS
    ? (seconds as number)
    : null;

export async function recordWin(
  q: Q,
  day: PlayDay,
  player: string,
  ids: readonly number[],
  seconds: unknown,
): Promise<DayStats | "not_won"> {
  const board = boardOf(day, ids);
  if (typeof board === "string" || ids.at(-1) !== day.answer.id) {
    return "not_won";
  }
  const key = { gameId: day.game.id, date: day.date, player };
  await recordResult(q, key, {
    guesses: ids.length,
    seconds: knownSeconds(seconds),
  });
  return dayStats(q, key, day.day);
}

export async function recordFailure(
  q: Q,
  day: Pick<PlayDay, "game" | "date">,
  player: string,
  guesses: number,
): Promise<void> {
  await q.query(
    "insert into game_results (game_id, day, player, guesses, won) values ($1, $2, $3, $4, false) on conflict do nothing",
    [day.game.id, day.date, player, guesses],
  );
}

export async function dayStats(
  q: Q,
  { gameId, date, player }: ResultKey,
  day: number,
): Promise<DayStats> {
  const { rows } = await q.query<WinResult & { player: string; won: boolean }>(
    `select r.player, r.guesses, r.seconds, r.won from game_results r
     where r.game_id = $1 and r.day = $2 and (r.player = $3 or (r.player like 'user:%' and not exists (
       select 1 from users u where r.player = 'user:' || u.id and u.banned_at is not null
     )))`,
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
