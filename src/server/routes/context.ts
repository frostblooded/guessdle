// What every route group needs from createApp, plus the request-input helpers.
import type { Request, Response } from "express";
import type pg from "pg";
import type { Pet } from "../../game/roster.ts";
import { ensureAnswer } from "../answers.ts";

export interface AppContext {
  pool: pg.Pool;
  roster: readonly Pet[];
  petIds: string[];
  now: () => Date;
  random: () => number;
  timeZone: string;
  secureCookies: boolean;
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
  { roster }: AppContext,
  value: unknown,
): value is string[] =>
  Array.isArray(value) &&
  value.length <= roster.length &&
  value.every((id: unknown) => typeof id === "string");

// Today's answer, or a 500 sent and undefined
export async function todaysAnswer(
  { pool, roster, petIds, random }: AppContext,
  res: Response,
  date: string,
  day: number,
): Promise<Pet | undefined> {
  const answerId = await ensureAnswer(pool, petIds, date, random);
  const answer = roster.find((pet) => pet.id === answerId);
  if (!answer) {
    res.status(500).json({ error: "answer_missing", day });
  }
  return answer;
}
