// What every route group needs from createApp, plus the request-input helpers.
import type { Request, Response } from "express";
import type pg from "pg";
import { FAILURES, type FailureCode } from "../../game/failures.ts";
import {
  resolveGame,
  type LoadedGame,
  type Need,
  type Resolved,
} from "../access.ts";
import { isImageGame } from "../../game/blur.ts";
import type { MailConfig } from "../mailer.ts";
import type { GameRow, Roster } from "../games.ts";
import { openDay, type DayRefusal, type PlayDay } from "../play-day.ts";

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

// A guess list as a request sends it: at most one guess per entry, or for a Blur or Sequence
// game (which may skip, ADR 0019) one per try
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

// The Day of play a request names (`?day=N`, today when absent) with its answer, or the
// refusal sent and undefined. `accepts` validates the rest of the request (openDay).
export async function playDayOf(
  ctx: AppContext,
  req: Request,
  res: Response,
  loaded: LoadedGame,
  accepts?: () => boolean,
): Promise<PlayDay | undefined> {
  const out = await openDay(ctx, loaded, queryOf(req)["day"], accepts);
  if ("refusal" in out) {
    sendRefusal(res, out);
    return undefined;
  }
  return out;
}

// A day's refusal with its status; once the day is known the reply names it
export function sendRefusal(res: Response, out: DayRefusal): void {
  res.status(FAILURES[out.refusal].status).json({
    error: out.refusal satisfies FailureCode,
    ...("day" in out && { day: out.day }),
  });
}
