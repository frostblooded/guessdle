// Quiz games (ADR 0021): the owner writes questions in order, each multiple choice or a number
// answer scored by closeness. A player takes the whole quiz and sees the right answers only at
// the end; a party plays one question per round. Pure, so the server, the editor and Play share it.
import { MAX_OPTION, MAX_OPTIONS, MIN_OPTIONS } from "./limits.ts";
import type { QuizFriendResult } from "./friends.ts";
import { parseNumberValue } from "./number.ts";
import { Correctness } from "./correctness.ts";

// What makes a question gradable, stored with it. A choice question names its right option by
// index; a number question gives the answer and the distance at which points reach 0.
export type QuizSpec =
  { options: string[]; correct: number } | { answer: string; range: string };

// A question as players see it before answering: no right answer. `options` is null for a
// number question.
export interface QuizQuestion {
  id: number;
  prompt: string;
  photo: string;
  options: string[] | null;
}

// A player's answer: a choice question's option index as text ("0", "1", ...), or the number typed
export type QuizAnswer = string;

export const isChoice = (
  spec: QuizSpec,
): spec is { options: string[]; correct: number } => "options" in spec;

// The spec in a request body, trimmed; undefined when malformed. Options must differ (ignoring
// case), so a player can always tell them apart.
export function parseQuizSpec(value: unknown): QuizSpec | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const v = value as Record<string, unknown>;
  if (Array.isArray(v["options"])) {
    const options = v["options"].map((o: unknown) =>
      typeof o === "string" ? o.trim() : "",
    );
    const correct = v["correct"];
    return options.length >= MIN_OPTIONS &&
      options.length <= MAX_OPTIONS &&
      options.every((o) => o !== "" && o.length <= MAX_OPTION) &&
      new Set(options.map((o) => o.toLowerCase())).size === options.length &&
      Number.isInteger(correct) &&
      (correct as number) >= 0 &&
      (correct as number) < options.length
      ? { options, correct: correct as number }
      : undefined;
  }
  const answer =
    typeof v["answer"] === "string" ? parseNumberValue(v["answer"]) : null;
  const range =
    typeof v["range"] === "string" ? parseNumberValue(v["range"]) : null;
  return answer !== null && range !== null && Number(range) >= 0
    ? { answer, range }
    : undefined;
}

// True when `b` asks what `a` asks: the same options, or both a number. Only the right answer
// (the right option, or a number's answer and range) may differ; such an edit skips reapproval.
export const sameQuestion = (a: QuizSpec, b: QuizSpec): boolean =>
  isChoice(a) && isChoice(b)
    ? a.options.length === b.options.length &&
      a.options.every((o, i) => o === b.options[i])
    : !isChoice(a) && !isChoice(b);

export const questionOf = (
  { id, name, photo }: { id: number; name: string; photo: string },
  spec: QuizSpec,
): QuizQuestion => ({
  id,
  prompt: name,
  photo,
  options: isChoice(spec) ? spec.options : null,
});

// Points for one answer, 0 to 1 in hundredths. A choice is all or nothing. A number gets 1 when
// exact, falling in a straight line to 0 at `range` away (a range of 0: exact only).
export function scoreAnswer(spec: QuizSpec, answer: unknown): number {
  if (typeof answer !== "string") {
    return 0;
  }
  if (isChoice(spec)) {
    return answer === String(spec.correct) ? 1 : 0;
  }
  const typed = parseNumberValue(answer);
  if (typed === null) {
    return 0;
  }
  const off = Math.abs(Number(typed) - Number(spec.answer));
  const range = Number(spec.range);
  const points = range === 0 ? Number(off === 0) : Math.max(0, 1 - off / range);
  return Math.round(points * 100) / 100;
}

// Whether `answer` is one a question takes: an option's index, or a number
export const isAnswerTo = (spec: QuizSpec, answer: unknown): boolean =>
  typeof answer === "string" &&
  (isChoice(spec)
    ? /^\d+$/.test(answer) && Number(answer) < spec.options.length
    : parseNumberValue(answer) !== null);

// An answer as the review and party results show it
export const answerText = (spec: QuizSpec, answer: QuizAnswer): string =>
  isChoice(spec)
    ? (spec.options[Number(answer)] ?? "")
    : (parseNumberValue(answer) ?? answer);

export const rightAnswerText = (spec: QuizSpec): string =>
  isChoice(spec) ? spec.options[spec.correct]! : spec.answer;

// A score as the site writes it: whole points as is, else up to two decimals ("3", "2.75")
export const scoreText = (points: number): string =>
  String(Math.round(points * 100) / 100);

// One question of a finished quiz, as its review shows it
export interface ReviewItem {
  id: number;
  prompt: string;
  photo: string;
  // The player's answer as text, null when they left it blank
  yours: string | null;
  right: string;
  points: number;
}

// POST /api/games/:slug/quiz: the player's score, the review and how everyone's first scores spread
export interface QuizResult {
  score: number;
  total: number;
  review: ReviewItem[];
  stats: QuizStats;
}

export interface QuizStats {
  // This player's first score, the one that counts; null when it could not be recorded
  first: number | null;
  // Players with a recorded first score, this one included
  players: number;
  // spread[i]: players whose first score was at least i and under i + 1 (the last bar: a full score)
  spread: number[];
  // Signed-in players only: their friends' first scores, best first
  friends?: QuizFriendResult[];
}

// Grades every active question (a question left out scores 0) and builds the review
export function gradeQuiz(
  questions: readonly {
    id: number;
    name: string;
    photo: string;
    spec: QuizSpec;
  }[],
  answers: Readonly<Record<string, unknown>>,
): { score: number; review: ReviewItem[] } {
  const review = questions.map(({ id, name, photo, spec }): ReviewItem => {
    const given = answers[String(id)];
    const yours = isAnswerTo(spec, given) ? (given as string) : null;
    return {
      id,
      prompt: name,
      photo,
      yours: yours === null ? null : answerText(spec, yours),
      right: rightAnswerText(spec),
      points: yours === null ? 0 : scoreAnswer(spec, yours),
    };
  });
  const score =
    Math.round(review.reduce((sum, item) => sum + item.points, 0) * 100) / 100;
  return { score, review };
}

// The bars of the score spread: one per whole point from 0 to `total`
export function spreadOf(scores: readonly number[], total: number): number[] {
  const bars = new Array<number>(total + 1).fill(0);
  for (const score of scores) {
    bars[Math.min(total, Math.max(0, Math.floor(score)))]! += 1;
  }
  return bars;
}

// A party round of a Quiz game: its question, the right answer and each player's one answer, graded
export interface QuizRound {
  question: QuizQuestion;
  right: string;
  answers: { playerId: number; text: string; points: number; at: number }[];
}

// A Quiz answer's square in party results: full points green, some orange, none red
export const quizGrade = (points: number): Correctness =>
  points >= 1
    ? Correctness.Correct
    : points > 0
      ? Correctness.PartiallyCorrect
      : Correctness.Incorrect;

// A Quiz answer's points as party results write them
export const quizPoints = (points: number): string =>
  `${scoreText(points)} ${points === 1 ? "quiz point" : "quiz points"}`;
