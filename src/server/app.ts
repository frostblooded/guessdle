import express from "express";
import type { ErrorRequestHandler, Express } from "express";
import type pg from "pg";
import { gradeIds } from "../game/game.ts";
import { GUESS_DATA, type Pet } from "../game/roster.ts";
import { dayNumber, ensureAnswer, todayIn } from "./answers.ts";

export interface AppDeps {
  pool: pg.Pool;
  roster?: readonly Pet[];
  now?: () => Date;
  random?: () => number;
  // IANA zone whose midnight starts a new day
  timeZone?: string | undefined;
}

// The API only; callers add static files (dev server) or sit behind nginx (prod)
export function createApp({
  pool,
  roster = GUESS_DATA,
  now = (): Date => new Date(),
  random = Math.random,
  timeZone = "Europe/Sofia",
}: AppDeps): Express {
  const app = express();
  app.get("/api/health", async (_req, res) => {
    try {
      await pool.query("select 1");
      res.json({ status: "ok" });
    } catch {
      res.status(503).json({ status: "unavailable" });
    }
  });

  // Stateless grading for anonymous players. The answer is revealed only to a
  // batch containing the right guess.
  app.post("/api/grade", express.json({ limit: "10kb" }), async (req, res) => {
    const date = todayIn(now(), timeZone);
    const day = dayNumber(date);
    const fail = (status: number, error: string): void => {
      res.status(status).json({ error, day });
    };
    const ids: unknown = (req.body as { ids?: unknown } | undefined)?.ids;
    if (
      !Array.isArray(ids) ||
      ids.length > roster.length ||
      !ids.every((id: unknown) => typeof id === "string")
    ) {
      fail(400, "invalid");
      return;
    }

    const answerId = await ensureAnswer(
      pool,
      roster.map((pet) => pet.id),
      date,
      random,
    );
    const answer = roster.find((pet) => pet.id === answerId);
    if (!answer) {
      fail(500, "answer_missing");
      return;
    }

    const graded = gradeIds(roster, answer, ids as string[]);
    if (graded.kind === "invalid") {
      fail(400, "invalid");
      return;
    }
    if (graded.kind === "duplicate") {
      fail(409, "duplicate");
      return;
    }
    res.json({
      day,
      rows: graded.rows,
      victory: graded.victory,
      ...(graded.victory && { answer: answer.name }),
    });
  });

  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "not_found" });
  });
  // Body-parser failures (malformed JSON, over the size cap) carry a 4xx status
  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    const status: unknown = (err as { status?: unknown }).status;
    if (typeof status === "number" && status >= 400 && status < 500) {
      res.status(status).json({ error: "invalid" });
      return;
    }
    console.error(err);
    res.status(500).json({ error: "server_error" });
  };
  app.use(onError);
  return app;
}
