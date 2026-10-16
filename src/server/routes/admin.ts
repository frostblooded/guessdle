// Admin-only answer, backup and user management (spec #38).
import express from "express";
import type { Express, Request, Response } from "express";
import { readBackupStatus } from "../backup.ts";
import {
  ANSWER_START,
  clearOverride,
  dateOfDay,
  dayNumber,
  peekDays,
  setOverride,
  todayIn,
} from "../answers.ts";
import { requestUser, type SessionUser } from "../auth.ts";
import { listUsers, setAdmin } from "../users.ts";
import { bodyOf, paramOf, queryOf, type AppContext } from "./context.ts";

const MAX_RANGE_DAYS = 366;
const MAX_USER_ID = 2147483647;

const isDate = (value: unknown): value is string =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
  dateOfDay(dayNumber(value)) === value;

// A date the admin may name: valid, not before the start, within a year ahead
const adminDate = (value: unknown, todayN: number): value is string =>
  isDate(value) &&
  value >= ANSWER_START &&
  dayNumber(value) <= todayN + MAX_RANGE_DAYS;

const refusePastDay = (res: Response, date: string, today: string): boolean => {
  if (date < today) {
    res.status(409).json({ error: "past_day" });
  }
  return date < today;
};

interface AdminCtx {
  req: Request;
  res: Response;
  today: string;
  todayN: number;
  actor: SessionUser;
}

export function adminRoutes(
  app: Express,
  ctx: AppContext,
  backupDir: string,
): void {
  const { pool, roster, petIds, now, random, timeZone } = ctx;
  const adminRoute =
    (handler: (admin: AdminCtx) => Promise<void>) =>
    async (req: Request, res: Response): Promise<void> => {
      res.set("Cache-Control", "no-store");
      const user = await requestUser(pool, req, now());
      if (!user) {
        res.status(401).json({ error: "unauthorized" });
        return;
      }
      if (!user.admin) {
        res.status(403).json({ error: "forbidden" });
        return;
      }
      const today = todayIn(now(), timeZone);
      await handler({ req, res, today, todayN: dayNumber(today), actor: user });
    };

  app.get(
    "/api/admin/answers",
    adminRoute(async ({ req, res, today, todayN }) => {
      const query = queryOf(req);
      const rawFrom = query["from"] ?? today;
      const rawTo = query["to"] ?? dateOfDay(todayN + 6);
      // A start before Day Number 0 is clamped to it
      const from =
        isDate(rawFrom) && rawFrom < ANSWER_START ? ANSWER_START : rawFrom;
      if (
        !isDate(from) ||
        !adminDate(rawTo, todayN) ||
        rawTo < from ||
        dayNumber(rawTo) - dayNumber(from) >= MAX_RANGE_DAYS
      ) {
        res.status(400).json({ error: "invalid" });
        return;
      }
      const days = await peekDays(pool, petIds, from, rawTo, random);
      res.json({
        today,
        from,
        to: rawTo,
        days: days.map((row) => {
          const pet = roster.find((p) => p.id === row.petId);
          return {
            date: row.date,
            petId: row.petId,
            name: pet?.name ?? null,
            source: row.source,
            today: row.date === today,
            locked: row.date < today,
            missing: pet === undefined,
            previous: row.previous,
          };
        }),
      });
    }),
  );
  app.put(
    "/api/admin/answers/:date",
    express.json({ limit: "1kb" }),
    adminRoute(async ({ req, res, today, todayN }) => {
      const date = paramOf(req, "date");
      const petId = bodyOf(req)["petId"];
      if (
        !adminDate(date, todayN) ||
        typeof petId !== "string" ||
        !petIds.includes(petId)
      ) {
        res.status(400).json({ error: "invalid" });
        return;
      }
      if (refusePastDay(res, date, today)) {
        return;
      }
      await setOverride(pool, petIds, date, petId, random);
      res.json({ ok: true });
    }),
  );
  app.delete(
    "/api/admin/answers/:date",
    adminRoute(async ({ req, res, today, todayN }) => {
      const date = paramOf(req, "date");
      if (!adminDate(date, todayN)) {
        res.status(400).json({ error: "invalid" });
        return;
      }
      if (refusePastDay(res, date, today)) {
        return;
      }
      if (!(await clearOverride(pool, petIds, date, random))) {
        res.status(409).json({ error: "not_override" });
        return;
      }
      res.json({ ok: true });
    }),
  );

  app.get(
    "/api/admin/backup",
    adminRoute(async ({ res }) => {
      res.json(await readBackupStatus(backupDir, now()));
    }),
  );
  app.get(
    "/api/admin/users",
    adminRoute(async ({ res, actor }) => {
      res.json({ users: await listUsers(pool), self: actor.id });
    }),
  );
  app.put(
    "/api/admin/users/:id",
    express.json({ limit: "1kb" }),
    adminRoute(async ({ req, res, actor }) => {
      const id = String(paramOf(req, "id"));
      const admin = bodyOf(req)["admin"];
      if (
        !/^[1-9]\d{0,9}$/.test(id) ||
        Number(id) > MAX_USER_ID ||
        typeof admin !== "boolean"
      ) {
        res.status(400).json({ error: "invalid" });
        return;
      }
      const result = await setAdmin(pool, actor.id, Number(id), admin);
      if (result === "ok") {
        res.json({ ok: true });
      } else {
        res
          .status(result === "not_found" ? 404 : 409)
          .json({ error: result === "self" ? "self_demotion" : result });
      }
    }),
  );
}
