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
  mail?: MailConfig | undefined;
}

export const bodyOf = (req: Request): Record<string, unknown> =>
  (req.body ?? {}) as Record<string, unknown>;
export const queryOf = (req: Request): Record<string, unknown> =>
  req.query as Record<string, unknown>;
export const paramOf = (req: Request, name: string): unknown =>
  req.params[name];

export const fail = (res: Response, code: FailureCode, day?: number): void => {
  res
    .status(FAILURES[code].status)
    .json({ error: code, ...(day !== undefined && { day }) });
};

export const isIdList = (
  game: GameRow,
  { entries }: Roster,
  value: unknown,
): value is number[] =>
  Array.isArray(value) &&
  value.length <= (isImageGame(game.kind) ? game.blurTries : entries.length) &&
  value.every((id: unknown) => Number.isInteger(id));

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

export const loadGame = (
  ctx: AppContext,
  req: Request,
  res: Response,
): Promise<LoadedGame | undefined> => guardGame(ctx, req, res, "play");

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

export function sendRefusal(res: Response, out: DayRefusal): void {
  fail(res, out.refusal, "day" in out ? out.day : undefined);
}
