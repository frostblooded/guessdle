// Grading and give-up for anonymous players, the signed-in Game State, and victory stats.
import express from "express";
import type { Express, Request, Response } from "express";
import { isImageGame } from "../../game/blur.ts";
import { isPlayerToken } from "../../game/stats.ts";
import { isHintKind } from "../../game/free-hint.ts";
import type { DaysResponse } from "../../game/days.ts";
import { listDays } from "../days.ts";
import { quizQuestions } from "../quiz.ts";
import { listGallery } from "../gallery.ts";
import { canApprove, canManage } from "../access.ts";
import { requestUser } from "../auth.ts";
import { knownSeconds, playerOf } from "../results.ts";
import { openDay, todayOf, triesOf, type PlayDay } from "../play-day.ts";
import {
  daySession,
  requestStore,
  type DaySession,
  type GameView,
  type Refusal,
} from "../day-session.ts";
import { changeGame, userSession, type GameContext } from "../user-game.ts";
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

  // A guest's Day session over the Board the request sends; `player` from the browser's token
  const guestSession = (
    day: PlayDay,
    body: Record<string, unknown>,
    ids: readonly number[] = [],
  ): DaySession =>
    daySession(pool, day, playerOf(null, body), requestStore(ids), ctx.random);

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
      const body = bodyOf(req);
      const ids = body["ids"] as number[];
      // A malformed list is refused before the day's answer is drawn
      const valid = (): boolean => isIdList(loaded.game, loaded.roster, ids);
      const day = await playDayOf(ctx, req, res, loaded, valid);
      if (!day) {
        return;
      }
      const board = await guestSession(day, body, ids).view();
      if (typeof board === "string") {
        fail(res, board, day.day);
        return;
      }
      res.json({
        day: board.day,
        revision: board.revision,
        rows: board.rows,
        victory: board.victory,
        ...(board.lost && { lost: true }),
        answer: board.answer,
        answerPhoto: board.answerPhoto,
        answerDescription: board.answerDescription,
        // The browser knows whether it already used its hint, and hides these then
        hints: board.hints,
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
      const body = bodyOf(req);
      const { ids, kind } = body;
      const day = await playDayOf(
        ctx,
        req,
        res,
        loaded,
        () => isIdList(loaded.game, loaded.roster, ids) && isHintKind(kind),
      );
      if (!day) {
        return;
      }
      const out = await guestSession(day, body, ids as number[]).hint(kind);
      if (typeof out === "string" || !out.hint) {
        fail(res, typeof out === "string" ? out : "no_hint", day.day);
        return;
      }
      res.json({ day: day.day, revision: day.revision, hint: out.hint });
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
      // An empty Board never refuses a give-up
      const out = (await guestSession(day, bodyOf(req)).giveUp()) as GameView;
      res.json({
        day: out.day,
        revision: out.revision,
        answer: out.answer,
        answerPhoto: out.answerPhoto,
        answerDescription: out.answerDescription,
      });
    },
  );

  // Records the player's first attempt of the day if it is a win (today, or a past day named by
  // ?day=N) and answers with that day's stats. Signed-in players are known by their session and
  // their stored guesses; anonymous ones by the browser's token and the ids they send, which
  // must end with the answer.
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
      const ids = body["ids"];
      const day = await playDayOf(
        ctx,
        req,
        res,
        loaded,
        () =>
          playerOf(user?.id ?? null, body) !== null &&
          (user !== null || isIdList(loaded.game, loaded.roster, ids)),
      );
      if (!day) {
        return;
      }
      const won = user
        ? await userSession(pool, { ...day, userId: user.id }, ctx.random).win(
            body["seconds"],
            isPlayerToken(body["player"]) ? body["player"] : undefined,
          )
        : await guestSession(day, body, ids as number[]).win(body["seconds"]);
      if (won === "not_won") {
        fail(res, "not_won", day.day);
        return;
      }
      res.json(
        user
          ? {
              ...won.stats,
              board: {
                guesses: won.guesses,
                seconds: knownSeconds(won.seconds),
              },
            }
          : won.stats,
      );
    },
  );

  // Signed-in Game State. Every route needs a session and the day's answer
  // (today, or a past day named by ?day=N).
  const gameRoute =
    (
      handler: (
        game: GameContext,
        body: Record<string, unknown>,
        res: Response,
      ) => Promise<void>,
    ) =>
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
      await handler({ ...day, userId: user.id }, bodyOf(req), res);
    };
  // One change to the account's Board, under its lock; answers the new view or the refusal
  const changeRoute = (
    action: (
      session: DaySession,
      body: Record<string, unknown>,
    ) => Promise<GameView | Refusal>,
  ): ReturnType<typeof gameRoute> =>
    gameRoute(async (game, body, res) => {
      const out = await changeGame(pool, game, ctx.random, (session) =>
        action(session, body),
      );
      if (typeof out === "string") {
        fail(res, out, game.day);
      } else {
        res.json(out);
      }
    });

  app.get(
    `${base}/state`,
    gameRoute(async (game, _body, res) => {
      res.json(await userSession(pool, game, ctx.random).view());
    }),
  );
  const json = express.json({ limit: "10kb" });
  app.post(
    `${base}/state/guess`,
    json,
    changeRoute((session, body) => session.guess(body["id"])),
  );
  app.post(
    `${base}/state/give-up`,
    json,
    changeRoute((session) => session.giveUp()),
  );
  app.post(
    `${base}/state/merge`,
    json,
    changeRoute((session, body) => session.merge(body)),
  );
  app.post(
    `${base}/state/hint`,
    json,
    changeRoute((session, body) => session.hint(body["kind"])),
  );
  app.post(
    `${base}/state/reset`,
    json,
    changeRoute((session) => session.reset()),
  );
}
