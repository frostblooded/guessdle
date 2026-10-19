// Taking a Quiz game (ADR 0021): one request grades the whole quiz, records the player's first
// score and answers with the review and the score spread.
import express from "express";
import type { Express } from "express";
import { gradeQuiz, type QuizResult } from "../../game/quiz.ts";
import { isPlayerToken, MAX_SECONDS } from "../../game/stats.ts";
import { playBlocker } from "../access.ts";
import { requestUser } from "../auth.ts";
import { gradable, recordScore } from "../quiz.ts";
import { bodyOf, fail, loadGame, type AppContext } from "./context.ts";

export function quizRoutes(app: Express, ctx: AppContext): void {
  const { pool, now } = ctx;

  // {answers: {questionId: answer}, seconds, player}. Signed-in players are known by their
  // session, anonymous ones by the browser's token.
  app.post(
    "/api/games/:slug/quiz",
    express.json({ limit: "32kb" }),
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      const loaded = await loadGame(ctx, req, res);
      if (!loaded) {
        return;
      }
      const { game, roster } = loaded;
      if (game.kind !== "quiz") {
        fail(res, "not_found");
        return;
      }
      const blocker = playBlocker(game, roster);
      if (blocker) {
        fail(res, blocker);
        return;
      }
      const body = bodyOf(req);
      const answers = body["answers"];
      const user = await requestUser(pool, req, now());
      const player = user
        ? `user:${user.id}`
        : isPlayerToken(body["player"])
          ? `anon:${body["player"]}`
          : null;
      if (
        typeof answers !== "object" ||
        answers === null ||
        Array.isArray(answers) ||
        player === null
      ) {
        fail(res, "invalid");
        return;
      }
      const questions = gradable(roster);
      const { score, review } = gradeQuiz(
        questions,
        answers as Record<string, unknown>,
      );
      const seconds = body["seconds"];
      const stats = await recordScore(
        pool,
        game.id,
        player,
        score,
        Number.isInteger(seconds) &&
          (seconds as number) >= 0 &&
          (seconds as number) <= MAX_SECONDS
          ? (seconds as number)
          : null,
        questions.length,
        now(),
      );
      res.json({
        score,
        total: questions.length,
        review,
        stats,
      } satisfies QuizResult);
    },
  );
}
