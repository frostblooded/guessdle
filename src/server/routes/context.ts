// What every route group needs from createApp, plus the request-input helpers.
import type { Request, Response } from "express";
import type pg from "pg";
import type { Entry } from "../../game/game.ts";
import { dayNumber, ensureAnswer, todayIn } from "../answers.ts";
import { requestUser, type SessionUser } from "../auth.ts";
import type { MailConfig } from "../mailer.ts";
import {
  findGame,
  loadRoster,
  MIN_ENTRIES,
  type GameRow,
  type Roster,
} from "../games.ts";

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

export const isIdList = (
  { entries }: Roster,
  value: unknown,
): value is number[] =>
  Array.isArray(value) &&
  value.length <= entries.length &&
  value.every((id: unknown) => Number.isInteger(id));

export interface LoadedGame {
  game: GameRow;
  roster: Roster;
  // The signed-in user, when the route looked them up
  user: SessionUser | null;
}

export const isPlayable = (game: GameRow, roster: Roster): boolean =>
  game.status !== "draft" && roster.entries.length >= MIN_ENTRIES;

export const canManage = (game: GameRow, user: SessionUser | null): boolean =>
  user !== null && (user.admin || game.ownerId === user.id);

// Resolves `:slug` and applies visibility: a draft or a game with fewer than 2
// active entries is a 404 for everyone but its owner and admins. Sends the 404
// and returns undefined otherwise.
export async function loadGame(
  { pool, now }: AppContext,
  req: Request,
  res: Response,
): Promise<LoadedGame | undefined> {
  const game = await findGame(pool, String(paramOf(req, "slug")));
  if (game) {
    const roster = await loadRoster(pool, game);
    const playable = isPlayable(game, roster);
    // Signed-in players are looked up anyway; anonymous ones skip the query
    const user =
      playable && !req.headers.cookie
        ? null
        : await requestUser(pool, req, now());
    if (playable || canManage(game, user)) {
      return { game, roster, user };
    }
  }
  res.status(404).json({ error: "not_found" });
  return undefined;
}

// Today's date and Day Number in the game's calendar
export function todayOf(
  { now, timeZone }: AppContext,
  game: GameRow,
): { date: string; day: number } {
  const date = todayIn(now(), timeZone);
  return { date, day: dayNumber(date, game.startDate) };
}

// Today's answer, or a 500 sent and undefined
export async function todaysAnswer(
  { pool, random }: AppContext,
  res: Response,
  { game, roster }: LoadedGame,
  date: string,
  day: number,
): Promise<Entry | undefined> {
  const answerId = await ensureAnswer(
    pool,
    game,
    roster.entries.map((entry) => entry.id),
    date,
    random,
  );
  const answer = roster.all.find((entry) => entry.id === answerId);
  if (!answer) {
    res.status(500).json({ error: "answer_missing", day });
  }
  return answer;
}
