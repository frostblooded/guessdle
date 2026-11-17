import type pg from "pg";
import {
  questionOf,
  spreadOf,
  type QuizQuestion,
  type QuizSpec,
  type QuizStats,
} from "../game/quiz.ts";
import { quizFriendResults, userIdOf } from "./friends.ts";
import type { Roster } from "./games.ts";

type Q = Pick<pg.Pool, "query">;

export interface GradableQuestion {
  id: number;
  name: string;
  photo: string;
  spec: QuizSpec;
}

export const gradable = ({ entries }: Roster): GradableQuestion[] =>
  entries.flatMap(({ id, name, photo, quiz }) =>
    quiz ? [{ id, name, photo, spec: quiz }] : [],
  );

export const quizQuestions = (roster: Roster): QuizQuestion[] =>
  gradable(roster).map((q) => questionOf(q, q.spec));

export async function recordScore(
  q: Q,
  gameId: number,
  player: string,
  score: number,
  seconds: number | null,
  total: number,
  now: Date,
): Promise<QuizStats> {
  await q.query(
    `insert into quiz_results (game_id, player, score, seconds, created_at)
     values ($1, $2, $3, $4, $5) on conflict do nothing`,
    [gameId, player, score, seconds, now],
  );
  const { rows } = await q.query<{ player: string; score: number }>(
    `select player, score::float8 as score from quiz_results
     where game_id = $1 and (player = $2 or player like 'user:%')`,
    [gameId, player],
  );
  const userId = userIdOf(player);
  return {
    ...(userId !== null && {
      friends: await quizFriendResults(q, userId, gameId),
    }),
    first: rows.find((row) => row.player === player)?.score ?? null,
    players: rows.length,
    spread: spreadOf(
      rows.map((row) => row.score),
      total,
    ),
  };
}
