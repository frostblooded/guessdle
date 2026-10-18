// Grading and give-up for anonymous players, the signed-in Game State, and victory stats.
import express from "express";
import type { Express, Request, Response } from "express";
import type pg from "pg";
import type { DaysResponse } from "../../game/days.ts";
import { listDays } from "../days.ts";
import { isPlayerToken } from "../../game/stats.ts";
import { listGallery } from "../gallery.ts";
import { canApprove, canManage } from "../access.ts";
import { requestUser, type SessionUser } from "../auth.ts";
import {
  boardOf,
  openDay,
  recordWin,
  revealOf,
  todayOf,
  triesOf,
} from "../play-day.ts";
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
  playDayOf,
  sendRefusal,
  type AppContext,
} from "./context.ts";

export function gameRoutes(app: Express, ctx: AppContext): void {
  const { pool, now } = ctx;
  const base = "/api/games/:slug";

  app.get("/api/games", async (_req, res) => {
    res.set("Cache-Control", "no-store");
    res.json(await listGallery(pool));
  });

  // What a player needs to render the game: its attributes and active entries. A Blur game's
  // entries go without photos: those are its answers (ADR 0019).
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
      kind: game.kind,
      ...(game.kind === "blur" && { blurTries: game.blurTries }),
      // Today's Day Number: past days are 0 up to it
      today: todayOf(ctx, game).day,
      startDate: game.startDate,
      attributes: roster.attributes,
      // Some entries miss values: nobody can play until they are filled in
      paused: roster.incomplete > 0,
      entries: roster.entries.map(({ id, name, photo }) => ({
        id,
        name,
        photo: game.kind === "blur" ? "" : photo,
      })),
    });
  });

  // The Past days list, with the signed-in player's progress on each day
  app.get(`${base}/days`, async (req, res) => {
    res.set("Cache-Control", "no-store");
    const loaded = await loadGame(ctx, req, res);
    if (!loaded) {
      return;
    }
    // Drawing today's answer fills every earlier day too
    const today = await openDay(ctx, loaded, undefined);
    if ("refusal" in today) {
      sendRefusal(res, today);
      return;
    }
    const days = await listDays(
      pool,
      loaded.game,
      today.day,
      loaded.user?.id ?? null,
    );
    res.json({
      today: today.day,
      tries: triesOf(loaded.game),
      days,
    } satisfies DaysResponse);
  });

  // Stateless grading for anonymous players. The answer is revealed only to a
  // batch containing the right guess, or one using up a Blur game's tries.
  app.post(
    `${base}/grade`,
    express.json({ limit: "10kb" }),
    async (req, res) => {
      const loaded = await loadGame(ctx, req, res);
      if (!loaded) {
        return;
      }
      const ids = bodyOf(req)["ids"];
      // A malformed list is refused before the day's answer is drawn
      const valid = (): boolean => isIdList(loaded.game, loaded.roster, ids);
      const day = await playDayOf(ctx, req, res, loaded, valid);
      if (!day || !isIdList(loaded.game, loaded.roster, ids)) {
        return;
      }
      const board = boardOf(day, ids);
      if (typeof board === "string") {
        res.status(REFUSAL_STATUS[board]).json({ error: board, day: day.day });
        return;
      }
      res.json({
        day: day.day,
        rows: board.rows,
        victory: board.victory,
        ...(board.lost && { lost: true }),
        ...board.reveal,
      });
    },
  );

  // Stateless and open to anyone by decision (spec #38): reveals the day's answer
  app.post(`${base}/give-up`, async (req, res) => {
    const loaded = await loadGame(ctx, req, res);
    if (!loaded) {
      return;
    }
    const day = await playDayOf(ctx, req, res, loaded);
    if (day) {
      res.json({ day: day.day, ...revealOf(day.game, day.answer) });
    }
  });

  // Records the player's first win of the day (today, or a past day named by ?day=N) and
  // answers with that day's stats. Signed-in
  // players are known by their session and their stored guesses; anonymous ones by
  // the browser's token and the ids they send, which must end with the answer.
  app.post(
    `${base}/result`,
    express.json({ limit: "10kb" }),
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      const user = await requestUser(pool, req, now());
      const loaded = await loadGame(ctx, req, res);
      if (!loaded) {
        return;
      }
      const body = bodyOf(req);
      const player = user
        ? `user:${user.id}`
        : isPlayerToken(body["player"])
          ? `anon:${body["player"]}`
          : null;
      const ids = body["ids"];
      const day = await playDayOf(
        ctx,
        req,
        res,
        loaded,
        () =>
          player !== null &&
          (user !== null || isIdList(loaded.game, loaded.roster, ids)),
      );
      if (!day || player === null) {
        return;
      }
      // A signed-in win is the stored guesses; an anonymous one the ids sent
      const won = user
        ? (await view(pool, { ...day, userId: user.id })).ids
        : (ids as number[]);
      const stats = await recordWin(pool, day, player, won, body["seconds"]);
      if (stats === "not_won") {
        res.status(409).json({ error: "not_won", day: day.day });
        return;
      }
      res.json(stats);
    },
  );

  // Signed-in Game State. Every route needs a session and the day's answer
  // (today, or a past day named by ?day=N).
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
      const loaded = await loadGame(ctx, req, res);
      if (!loaded) {
        return;
      }
      const day = await playDayOf(ctx, req, res, loaded);
      if (!day) {
        return;
      }
      await handler({
        ...day,
        userId: user.id,
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
    // Only today's browser guesses are adopted; past days stay where they were played
    changeRoute(async ({ body, ...game }, current, q) =>
      game.past ? "stale_day" : mergeLocal(q, game, current, body),
    ),
  );
  app.post(
    `${base}/state/reset`,
    json,
    changeRoute((game, _current, q) => resetGame(q, game)),
  );
}
