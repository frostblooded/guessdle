// Grading and give-up for anonymous players, the signed-in Game State, and victory stats.
import express from "express";
import type { Express, Request, Response } from "express";
import type pg from "pg";
import { isImageGame } from "../../game/blur.ts";
import { isPlayerToken } from "../../game/stats.ts";
import { isHintKind, pickHint, revealHint } from "../../game/free-hint.ts";
import type { DaysResponse } from "../../game/days.ts";
import { listDays } from "../days.ts";
import { quizQuestions } from "../quiz.ts";
import { listGallery } from "../gallery.ts";
import { canApprove, canManage } from "../access.ts";
import { requestUser } from "../auth.ts";
import { dropGuestResult, playerOf, recordFailure } from "../results.ts";
import {
  boardOf,
  knownSeconds,
  openDay,
  recordWin,
  revealOf,
  todayOf,
  triesOf,
} from "../play-day.ts";
import {
  addGuess,
  boardSeconds,
  changeGame,
  giveUp,
  mergeLocal,
  resetGame,
  takeHint,
  view,
  type GameContext,
  type GameView,
  type Refusal,
} from "../user-game.ts";
import {
  bodyOf,
  fail,
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

  // What a player needs to render the game: its attributes and active entries. A Blur or
  // Sequence game's entries go without photos: those are its answers (ADR 0019, 0020). A classic
  // game's carry their values for the selection list.
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
      entries:
        game.kind === "quiz"
          ? []
          : roster.entries.map(({ id, name, photo, values }) =>
              isImageGame(game.kind)
                ? { id, name, photo: "" }
                : { id, name, photo, values },
            ),
      // A Quiz game's questions, without their answers
      ...(game.kind === "quiz" && { questions: quizQuestions(roster) }),
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
      const ids = bodyOf(req)["ids"] as number[];
      // A malformed list is refused before the day's answer is drawn
      const valid = (): boolean => isIdList(loaded.game, loaded.roster, ids);
      const day = await playDayOf(ctx, req, res, loaded, valid);
      if (!day) {
        return;
      }
      const board = boardOf(day, ids);
      if (typeof board === "string") {
        fail(res, board, day.day);
        return;
      }
      // Out of tries on the browser's first attempt: no later win that day counts
      const player = playerOf(null, bodyOf(req));
      if (board.lost && player !== null) {
        await recordFailure(
          pool,
          { gameId: day.game.id, date: day.date, player },
          ids.length,
        );
      }
      res.json({
        day: day.day,
        revision: day.revision,
        rows: board.rows,
        victory: board.victory,
        ...(board.lost && { lost: true }),
        ...board.reveal,
        // The browser knows whether it already used its hint, and hides these then
        ...(board.hints && { hints: board.hints }),
      });
    },
  );

  // Stateless Free Hint for anonymous players: draws one of the offered kind for these
  // guesses. Like give-up it is open to anyone; the browser keeps it and asks only once.
  app.post(
    `${base}/hint`,
    express.json({ limit: "10kb" }),
    async (req, res) => {
      const loaded = await loadGame(ctx, req, res);
      if (!loaded) {
        return;
      }
      const { ids, kind } = bodyOf(req);
      const day = await playDayOf(
        ctx,
        req,
        res,
        loaded,
        () => isIdList(loaded.game, loaded.roster, ids) && isHintKind(kind),
      );
      if (!day || !isHintKind(kind)) {
        return;
      }
      const board = boardOf(day, ids as number[]);
      if (typeof board === "string") {
        fail(res, "invalid", day.day);
        return;
      }
      const { attributes } = day.roster;
      const pick =
        board.hints &&
        pickHint(attributes, day.answer, board.rows, kind, ctx.random);
      const hint = pick && revealHint(attributes, day.answer, pick);
      if (!hint) {
        fail(res, "no_hint", day.day);
        return;
      }
      res.json({ day: day.day, revision: day.revision, hint });
    },
  );

  // Stateless and open to anyone by decision (spec #38): reveals the day's answer. With the
  // browser's player token, a give-up on its first attempt keeps any later win out of the stats.
  app.post(
    `${base}/give-up`,
    express.json({ limit: "10kb" }),
    async (req, res) => {
      const loaded = await loadGame(ctx, req, res);
      if (!loaded) {
        return;
      }
      const day = await playDayOf(ctx, req, res, loaded);
      if (!day) {
        return;
      }
      const player = playerOf(null, bodyOf(req));
      if (player !== null) {
        await recordFailure(
          pool,
          { gameId: day.game.id, date: day.date, player },
          0,
        );
      }
      res.json({
        day: day.day,
        revision: day.revision,
        ...revealOf(day.game, day.answer),
      });
    },
  );

  // Records the player's first attempt of the day if it is a win (today, or a past day named by ?day=N) and
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
      const player = playerOf(user?.id ?? null, body);
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
      if (user && isPlayerToken(body["player"])) {
        await dropGuestResult(
          pool,
          { gameId: day.game.id, date: day.date },
          body["player"],
        );
      }
      // A signed-in win is the stored guesses, timed by the server when it saw them all (else
      // by the browser); an anonymous one the ids and time sent
      const game = user && { ...day, userId: user.id };
      const won = game ? (await view(pool, game)).ids : (ids as number[]);
      const seconds =
        (game && (await boardSeconds(pool, game))) ?? body["seconds"];
      const stats = await recordWin(pool, day, player, won, seconds);
      if (stats === "not_won") {
        fail(res, "not_won", day.day);
        return;
      }
      res.json(
        game
          ? {
              ...stats,
              board: { guesses: won.length, seconds: knownSeconds(seconds) },
            }
          : stats,
      );
    },
  );

  // Signed-in Game State. Every route needs a session and the day's answer
  // (today, or a past day named by ?day=N).
  interface GameRouteCtx extends GameContext {
    body: Record<string, unknown>;
    res: Response;
  }
  const gameRoute =
    (handler: (game: GameRouteCtx) => Promise<void>) =>
    async (req: Request, res: Response): Promise<void> => {
      res.set("Cache-Control", "no-store");
      const user = await requestUser(pool, req, now());
      if (!user) {
        fail(res, "unauthorized");
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
        fail(game.res, out.kind, game.day);
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
    `${base}/state/hint`,
    json,
    changeRoute(({ body, ...game }, current, q) =>
      takeHint(q, game, current, body["kind"], ctx.random),
    ),
  );
  app.post(
    `${base}/state/reset`,
    json,
    changeRoute((game, _current, q) => resetGame(q, game)),
  );
}
