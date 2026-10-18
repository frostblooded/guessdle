// What every route group needs from createApp, plus the request-input helpers.
import type { Request, Response } from "express";
import type pg from "pg";
import { FAILURES, type FailureCode } from "../../game/failures.ts";
import type { Entry } from "../../game/game.ts";
import { isImageGame, minEntriesOf } from "../../game/blur.ts";
import { dateOfDay, dayNumber, ensureAnswer, todayIn } from "../answers.ts";
import {
  resolveGame,
  type LoadedGame,
  type Need,
  type Resolved,
} from "../access.ts";
import type { MailConfig } from "../mailer.ts";
import type { GameRow, Roster } from "../games.ts";

export interface AppContext {
  pool: pg.Pool;
  now: () => Date;
  random: () => number;
  timeZone: string;
  secureCookies: boolean;
  // Mail transport; absent when SMTP is not configured
  mail?: MailConfig | undefined;
}

// Request input is untrusted: these are the only places it is cast, and every
// value is validated by the caller.
export const bodyOf = (req: Request): Record<string, unknown> =>
  (req.body ?? {}) as Record<string, unknown>;
export const queryOf = (req: Request): Record<string, unknown> =>
  req.query as Record<string, unknown>;
export const paramOf = (req: Request, name: string): unknown =>
  req.params[name];

// Sends a failure code with the status the table gives it
export const fail = (res: Response, code: FailureCode): void => {
  res.status(FAILURES[code].status).json({ error: code });
};

// A guess list as a request sends it: at most one guess per entry, or for a Blur or Sequence game
// (which may skip, ADR 0019) one per try
export const isIdList = (
  game: GameRow,
  { entries }: Roster,
  value: unknown,
): value is number[] =>
  Array.isArray(value) &&
  value.length <= (isImageGame(game.kind) ? game.blurTries : entries.length) &&
  value.every((id: unknown) => Number.isInteger(id));

// Resolves `:slug` for what the viewer wants to do (access.ts) and sends the 404/401/403 itself.
export async function guardGame<N extends Need>(
  { pool, now }: AppContext,
  req: Request,
  res: Response,
  need: N,
): Promise<Resolved<N> | undefined> {
  const out = await resolveGame(
    pool,
    now,
    req,
    String(paramOf(req, "slug")),
    need,
  );
  if (typeof out === "string") {
    fail(res, out);
    return undefined;
  }
  return out;
}

// Play access: a draft or a game with fewer than 2 active entries is a 404 for all but its owner and admins
export const loadGame = (
  ctx: AppContext,
  req: Request,
  res: Response,
): Promise<LoadedGame | undefined> => guardGame(ctx, req, res, "play");

// Today's date and Day Number in the game's calendar
export function todayOf(
  { now, timeZone }: AppContext,
  game: GameRow,
): { date: string; day: number } {
  const date = todayIn(now(), timeZone);
  return { date, day: dayNumber(date, game.startDate) };
}

// The day a request plays: today, or a past day named by `?day=N` (0 up to today).
// `past` marks an archive day, whose wins stay out of the daily stats.
export function dayOf(
  ctx: AppContext,
  req: Request,
  game: GameRow,
): { date: string; day: number; past: boolean } | null {
  const today = todayOf(ctx, game);
  const raw = queryOf(req)["day"];
  if (raw === undefined) {
    return { ...today, past: false };
  }
  if (typeof raw !== "string" || !/^\d{1,6}$/.test(raw)) {
    return null;
  }
  const day = Number(raw);
  if (day > today.day) {
    return null;
  }
  return {
    date: dateOfDay(day, game.startDate),
    day,
    past: day !== today.day,
  };
}

// The answer for `date` (today or a past day), or the failure sent and undefined
export async function todaysAnswer(
  { pool, random }: AppContext,
  res: Response,
  { game, roster }: LoadedGame,
  date: string,
  day: number,
): Promise<Entry | undefined> {
  // Only the owner and admins reach a game this small; no answer can be drawn from it
  if (roster.entries.length < minEntriesOf(game.kind)) {
    res
      .status(FAILURES.not_enough_entries.status)
      .json({ error: "not_enough_entries" satisfies FailureCode, day });
    return undefined;
  }
  if (roster.incomplete > 0) {
    res
      .status(FAILURES.game_paused.status)
      .json({ error: "game_paused" satisfies FailureCode, day });
    return undefined;
  }
  const answerId = await ensureAnswer(
    pool,
    game,
    roster.answerIds,
    date,
    random,
  );
  const answer = roster.all.find((entry) => entry.id === answerId);
  if (!answer) {
    res.status(500).json({ error: "answer_missing", day });
  }
  return answer;
}
