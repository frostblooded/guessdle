// Grading and give-up for anonymous players, and the signed-in Game State.
import express from "express";
import type { Express, Request, Response } from "express";
import type pg from "pg";
import { gradeIds } from "../../game/game.ts";
import { listGallery } from "../games.ts";
import { canApprove, canManage, type LoadedGame } from "../access.ts";
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
import {
  bodyOf,
  isIdList,
  loadGame,
  todayOf,
  todaysAnswer,
  type AppContext,
} from "./context.ts";

export function gameRoutes(app: Express, ctx: AppContext): void {
  const { pool, now } = ctx;
  const base = "/api/games/:slug";

  app.get("/api/games", async (_req, res) => {
    res.set("Cache-Control", "no-store");
    res.json(await listGallery(pool));
  });

  // What a player needs to render the game: its attributes and active entries
  app.get(base, async (req, res) => {
    res.set("Cache-Control", "no-store");
    const loaded = await loadGame(ctx, req, res);
    if (!loaded) {
      return;
    }
    const { game, roster, user } = loaded;
    const manages = canManage(game, user);
    res.json({
      canEdit: manages,
      canApprove: canApprove(game, user),
      // Only the owner and admins learn the status (issue #87)
      ...(manages && { status: game.status, rejectReason: game.rejectReason }),
      slug: game.slug,
      name: game.name,
      description: game.description,
      cover: game.coverUrl,
      attributes: roster.attributes,
      // Some entries miss values: nobody can play until they are filled in
      paused: roster.incomplete > 0,
      entries: roster.entries.map(({ id, name, photo }) => ({
        id,
        name,
        photo,
      })),
    });
  });

  // Stateless grading for anonymous players. The answer is revealed only to a
  // batch containing the right guess.
  app.post(
    `${base}/grade`,
    express.json({ limit: "10kb" }),
    async (req, res) => {
      const loaded = await loadGame(ctx, req, res);
      if (!loaded) {
        return;
      }
      const { game, roster } = loaded;
      const { date, day } = todayOf(ctx, game);
      const fail = (status: number, error: string): void => {
        res.status(status).json({ error, day });
      };
      const ids = bodyOf(req)["ids"];
      if (!isIdList(roster, ids)) {
        fail(400, "invalid");
        return;
      }

      const answer = await todaysAnswer(ctx, res, loaded, date, day);
      if (!answer) {
        return;
      }

      const graded = gradeIds(roster.attributes, roster.all, answer, ids);
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
    },
  );

  // Stateless and open to anyone by decision (spec #38): reveals today's answer
  app.post(`${base}/give-up`, async (req, res) => {
    const loaded = await loadGame(ctx, req, res);
    if (!loaded) {
      return;
    }
    const { date, day } = todayOf(ctx, loaded.game);
    const answer = await todaysAnswer(ctx, res, loaded, date, day);
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
      const user = await requestUser(pool, req, now());
      if (!user) {
        res.status(401).json({ error: "unauthorized" });
        return;
      }
      const loaded: LoadedGame | undefined = await loadGame(ctx, req, res);
      if (!loaded) {
        return;
      }
      const { date, day } = todayOf(ctx, loaded.game);
      const answer = await todaysAnswer(ctx, res, loaded, date, day);
      if (!answer) {
        return;
      }
      await handler({
        game: loaded.game,
        roster: loaded.roster,
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
    `${base}/state`,
    gameRoute(async (game) => {
      game.res.json(await view(pool, game));
    }),
  );
  const json = express.json({ limit: "10kb" });
  app.post(
    `${base}/state/guess`,
    json,
    changeRoute(({ body, ...game }, current, q) =>
      addGuess(q, game, current, body["id"]),
    ),
  );
  app.post(
    `${base}/state/give-up`,
    json,
    changeRoute((game, current, q) => giveUp(q, game, current)),
  );
  app.post(
    `${base}/state/merge`,
    json,
    changeRoute(({ body, ...game }, current, q) =>
      mergeLocal(q, game, current, body),
    ),
  );
  app.post(
    `${base}/state/reset`,
    json,
    changeRoute((game, _current, q) => resetGame(q, game)),
  );
}
