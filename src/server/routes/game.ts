// Grading and give-up for anonymous players, and the signed-in Game State.
import express from "express";
import type { Express, Request, Response } from "express";
import type pg from "pg";
import { gradeIds } from "../../game/game.ts";
import { dayNumber, todayIn } from "../answers.ts";
import { requestUser, type SessionUser } from "../auth.ts";
import {
  addGuess,
  changeGame,
  giveUp,
  mergeLocal,
  resetGame,
  REFUSAL_STATUS,
  view,
  type GameContext,
  type GameView,
  type Refusal,
} from "../user-game.ts";
import { bodyOf, isIdList, todaysAnswer, type AppContext } from "./context.ts";

export function gameRoutes(app: Express, ctx: AppContext): void {
  const { pool, roster, now, timeZone } = ctx;

  // Stateless grading for anonymous players. The answer is revealed only to a
  // batch containing the right guess.
  app.post("/api/grade", express.json({ limit: "10kb" }), async (req, res) => {
    const date = todayIn(now(), timeZone);
    const day = dayNumber(date);
    const fail = (status: number, error: string): void => {
      res.status(status).json({ error, day });
    };
    const ids = bodyOf(req)["ids"];
    if (!isIdList(ctx, ids)) {
      fail(400, "invalid");
      return;
    }

    const answer = await todaysAnswer(ctx, res, date, day);
    if (!answer) {
      return;
    }

    const graded = gradeIds(roster, answer, ids);
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

  // Stateless and open to anyone by decision (spec #38): reveals today's answer
  app.post("/api/give-up", async (_req, res) => {
    const date = todayIn(now(), timeZone);
    const day = dayNumber(date);
    const answer = await todaysAnswer(ctx, res, date, day);
    if (answer) {
      res.json({ day, answer: answer.name });
    }
  });

  // Signed-in Game State. Every route needs a session and today's answer.
  interface GameRouteCtx extends GameContext {
    user: SessionUser;
    body: Record<string, unknown>;
    res: Response;
  }
  const gameRoute =
    (handler: (game: GameRouteCtx) => Promise<void>) =>
    async (req: Request, res: Response): Promise<void> => {
      res.set("Cache-Control", "no-store");
      const date = todayIn(now(), timeZone);
      const day = dayNumber(date);
      const user = await requestUser(pool, req, now());
      if (!user) {
        res.status(401).json({ error: "unauthorized" });
        return;
      }
      const answer = await todaysAnswer(ctx, res, date, day);
      if (!answer) {
        return;
      }
      await handler({
        roster,
        answer,
        userId: user.id,
        date,
        day,
        user,
        body: bodyOf(req),
        res,
      });
    };
  const changeRoute = (
    action: (
      game: GameRouteCtx,
      current: GameView,
      q: Pick<pg.Pool, "query">,
    ) => Promise<Refusal | null>,
  ): ReturnType<typeof gameRoute> =>
    gameRoute(async (game) => {
      const out = await changeGame(pool, game, (current, q) =>
        action(game, current, q),
      );
      if (out.kind === "ok") {
        game.res.json(out.view);
      } else {
        game.res
          .status(REFUSAL_STATUS[out.kind])
          .json({ error: out.kind, day: game.day });
      }
    });

  app.get(
    "/api/game",
    gameRoute(async (game) => {
      game.res.json(await view(pool, game));
    }),
  );
  const json = express.json({ limit: "10kb" });
  app.post(
    "/api/game/guess",
    json,
    changeRoute(({ body, ...game }, current, q) =>
      addGuess(q, game, current, body["id"]),
    ),
  );
  app.post(
    "/api/game/give-up",
    json,
    changeRoute((game, current, q) => giveUp(q, game, current)),
  );
  app.post(
    "/api/game/merge",
    json,
    changeRoute(({ body, ...game }, current, q) =>
      mergeLocal(q, game, current, body),
    ),
  );
  app.post(
    "/api/game/reset",
    json,
    changeRoute((game, current, q) => resetGame(q, game, current)),
  );
}
