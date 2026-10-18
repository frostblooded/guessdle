// Grading and give-up for anonymous players, the signed-in Game State, and victory stats.
import express from "express";
import type { Express, Request, Response } from "express";
import type pg from "pg";
import { gradeIds } from "../../game/game.ts";
import { isImageGame } from "../../game/blur.ts";
import type { DaysResponse } from "../../game/days.ts";
import { listDays } from "../days.ts";
import { isPlayerToken, MAX_SECONDS } from "../../game/stats.ts";
import { listGallery } from "../gallery.ts";
import { canApprove, canManage, type LoadedGame } from "../access.ts";
import { requestUser, type SessionUser } from "../auth.ts";
import { dayStats, recordResult } from "../results.ts";
import {
  addGuess,
  changeGame,
  giveUp,
  isLost,
  mergeLocal,
  resetGame,
  REFUSAL_STATUS,
  revealOf,
  triesOf,
  view,
  type GameContext,
  type GameView,
  type Refusal,
} from "../user-game.ts";
import {
  bodyOf,
  dayOf,
  fail as failWith,
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

  // What a player needs to render the game: its attributes and active entries. A Blur or
  // Sequence game's entries go without photos: those are its answers (ADR 0019, 0020).
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
      ...(isImageGame(game.kind) && { blurTries: game.blurTries }),
      // Today's Day Number: past days are 0 up to it
      today: todayOf(ctx, game).day,
      startDate: game.startDate,
      attributes: roster.attributes,
      // Some entries miss values: nobody can play until they are filled in
      paused: roster.incomplete > 0,
      entries: roster.entries.map(({ id, name, photo }) => ({
        id,
        name,
        photo: isImageGame(game.kind) ? "" : photo,
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
    const { date, day } = todayOf(ctx, loaded.game);
    // Drawing today's answer fills every earlier day too
    if (!(await todaysAnswer(ctx, res, loaded, date, day))) {
      return;
    }
    const days = await listDays(
      pool,
      loaded.game,
      day,
      loaded.user?.id ?? null,
    );
    res.json({
      today: day,
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
      const { game, roster } = loaded;
      const played = dayOf(ctx, req, game);
      if (!played) {
        failWith(res, "no_such_day");
        return;
      }
      const { date, day } = played;
      const fail = (status: number, error: string): void => {
        res.status(status).json({ error, day });
      };
      const ids = bodyOf(req)["ids"];
      if (!isIdList(game, roster, ids)) {
        fail(400, "invalid");
        return;
      }

      const answer = await todaysAnswer(ctx, res, loaded, date, day);
      if (!answer) {
        return;
      }

      const graded = gradeIds(
        roster.attributes,
        roster.all,
        answer,
        ids,
        game.kind,
      );
      if (graded.kind === "invalid") {
        fail(400, "invalid");
        return;
      }
      if (graded.kind === "duplicate") {
        fail(409, "duplicate");
        return;
      }
      const lost = isLost(game, ids, graded.victory);
      res.json({
        day,
        rows: graded.rows,
        victory: graded.victory,
        ...(lost && { lost: true }),
        ...((graded.victory || lost) && revealOf(game, answer)),
      });
    },
  );

  // Stateless and open to anyone by decision (spec #38): reveals the day's answer
  app.post(`${base}/give-up`, async (req, res) => {
    const loaded = await loadGame(ctx, req, res);
    if (!loaded) {
      return;
    }
    const played = dayOf(ctx, req, loaded.game);
    if (!played) {
      failWith(res, "no_such_day");
      return;
    }
    const { date, day } = played;
    const answer = await todaysAnswer(ctx, res, loaded, date, day);
    if (answer) {
      res.json({ day, ...revealOf(loaded.game, answer) });
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
      const { game, roster } = loaded;
      const played = dayOf(ctx, req, game);
      if (!played) {
        failWith(res, "no_such_day");
        return;
      }
      const { date, day, past } = played;
      const body = bodyOf(req);
      const player = user
        ? `user:${user.id}`
        : isPlayerToken(body["player"])
          ? `anon:${body["player"]}`
          : null;
      const ids = body["ids"];
      if (player === null || (!user && !isIdList(game, roster, ids))) {
        res.status(400).json({ error: "invalid", day });
        return;
      }
      const answer = await todaysAnswer(ctx, res, loaded, date, day);
      if (!answer) {
        return;
      }
      const won = user
        ? (
            await view(pool, {
              game,
              roster,
              answer,
              userId: user.id,
              date,
              day,
              past,
            })
          ).ids
        : (ids as number[]);
      const graded = gradeIds(
        roster.attributes,
        roster.all,
        answer,
        won,
        game.kind,
      );
      if (graded.kind !== "graded" || won.at(-1) !== answer.id) {
        res.status(409).json({ error: "not_won", day });
        return;
      }
      const seconds = body["seconds"];
      const key = { gameId: game.id, date, player };
      await recordResult(pool, key, {
        guesses: won.length,
        seconds:
          Number.isInteger(seconds) &&
          (seconds as number) >= 0 &&
          (seconds as number) <= MAX_SECONDS
            ? (seconds as number)
            : null,
      });
      res.json(await dayStats(pool, key, day));
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
      const loaded: LoadedGame | undefined = await loadGame(ctx, req, res);
      if (!loaded) {
        return;
      }
      const played = dayOf(ctx, req, loaded.game);
      if (!played) {
        failWith(res, "no_such_day");
        return;
      }
      const { date, day, past } = played;
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
        past,
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
