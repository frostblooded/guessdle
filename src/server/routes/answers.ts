// Per-game Daily Answer peek and Overrides: owner and admin only.
import express from "express";
import type { Express, Request, Response } from "express";
import {
  clearOverride,
  dateOfDay,
  dayNumber,
  peekDays,
  setOverride,
  todayIn,
} from "../answers.ts";
import { requestUser } from "../auth.ts";
import type { GameRow } from "../games.ts";
import {
  bodyOf,
  canManage,
  loadGame,
  paramOf,
  queryOf,
  type AppContext,
  type LoadedGame,
} from "./context.ts";

const MAX_RANGE_DAYS = 366;

const isDate = (value: unknown, start: string): value is string =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
  dateOfDay(dayNumber(value, start), start) === value;

// A date the editor may name: valid, not before the start, within a year ahead
const answerDate = (
  value: unknown,
  game: GameRow,
  todayN: number,
): value is string =>
  isDate(value, game.startDate) &&
  value >= game.startDate &&
  dayNumber(value, game.startDate) <= todayN + MAX_RANGE_DAYS;

const refusePastDay = (res: Response, date: string, today: string): boolean => {
  if (date < today) {
    res.status(409).json({ error: "past_day" });
  }
  return date < today;
};

interface AnswersCtx extends LoadedGame {
  req: Request;
  res: Response;
  today: string;
  todayN: number;
  ids: number[];
}

export function answersRoutes(app: Express, ctx: AppContext): void {
  const { pool, now, random, timeZone } = ctx;
  const path = "/api/games/:slug/answers";
  const ownerRoute =
    (handler: (answers: AnswersCtx) => Promise<void>) =>
    async (req: Request, res: Response): Promise<void> => {
      res.set("Cache-Control", "no-store");
      if (!(await requestUser(pool, req, now()))) {
        res.status(401).json({ error: "unauthorized" });
        return;
      }
      const loaded = await loadGame(ctx, req, res);
      if (!loaded) {
        return;
      }
      if (!canManage(loaded.game, loaded.user)) {
        res.status(403).json({ error: "forbidden" });
        return;
      }
      const today = todayIn(now(), timeZone);
      await handler({
        ...loaded,
        req,
        res,
        today,
        todayN: dayNumber(today, loaded.game.startDate),
        ids: loaded.roster.entries.map((entry) => entry.id),
      });
    };

  app.get(
    path,
    ownerRoute(async ({ req, res, game, roster, ids, today, todayN }) => {
      const query = queryOf(req);
      const rawFrom = query["from"] ?? today;
      const rawTo = query["to"] ?? dateOfDay(todayN + 6, game.startDate);
      // A start before Day Number 0 is clamped to it
      const from =
        isDate(rawFrom, game.startDate) && rawFrom < game.startDate
          ? game.startDate
          : rawFrom;
      if (
        !isDate(from, game.startDate) ||
        !answerDate(rawTo, game, todayN) ||
        rawTo < from ||
        dayNumber(rawTo, game.startDate) - dayNumber(from, game.startDate) >=
          MAX_RANGE_DAYS
      ) {
        res.status(400).json({ error: "invalid" });
        return;
      }
      const days = await peekDays(pool, game, ids, from, rawTo, random);
      res.json({
        today,
        from,
        to: rawTo,
        days: days.map((row) => {
          const entry = roster.all.find((e) => e.id === row.entryId);
          return {
            date: row.date,
            entryId: row.entryId,
            name: entry?.name ?? null,
            source: row.source,
            today: row.date === today,
            locked: row.date < today,
            missing: entry === undefined,
            previous: row.previous,
          };
        }),
      });
    }),
  );
  app.put(
    `${path}/:date`,
    express.json({ limit: "1kb" }),
    ownerRoute(async ({ req, res, game, ids, today, todayN }) => {
      const date = paramOf(req, "date");
      const entryId = bodyOf(req)["entryId"];
      if (
        !answerDate(date, game, todayN) ||
        typeof entryId !== "number" ||
        !ids.includes(entryId)
      ) {
        res.status(400).json({ error: "invalid" });
        return;
      }
      if (refusePastDay(res, date, today)) {
        return;
      }
      await setOverride(pool, game, ids, date, entryId, random);
      res.json({ ok: true });
    }),
  );
  app.delete(
    `${path}/:date`,
    ownerRoute(async ({ req, res, game, ids, today, todayN }) => {
      const date = paramOf(req, "date");
      if (!answerDate(date, game, todayN)) {
        res.status(400).json({ error: "invalid" });
        return;
      }
      if (refusePastDay(res, date, today)) {
        return;
      }
      if (!(await clearOverride(pool, game, ids, date, random))) {
        res.status(409).json({ error: "not_override" });
        return;
      }
      res.json({ ok: true });
    }),
  );
}
