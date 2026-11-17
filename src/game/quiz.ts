import { MAX_OPTION, MAX_OPTIONS, MIN_OPTIONS } from "./limits.ts";
import type { QuizFriendResult } from "./friends.ts";
import { parseNumberValue } from "./number.ts";
import { Correctness } from "./correctness.ts";

export type QuizSpec =
  { options: string[]; correct: number } | { answer: string; range: string };

export interface QuizQuestion {
  id: number;
  prompt: string;
  photo: string;
  options: string[] | null;
}

export type QuizAnswer = string;

export const isChoice = (
  spec: QuizSpec,
): spec is { options: string[]; correct: number } => "options" in spec;

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

export const isAnswerTo = (spec: QuizSpec, answer: unknown): boolean =>
  typeof answer === "string" &&
  (isChoice(spec)
    ? /^\d+$/.test(answer) && Number(answer) < spec.options.length
    : parseNumberValue(answer) !== null);

export const answerText = (spec: QuizSpec, answer: QuizAnswer): string =>
  isChoice(spec)
    ? (spec.options[Number(answer)] ?? "")
    : (parseNumberValue(answer) ?? answer);

export const rightAnswerText = (spec: QuizSpec): string =>
  isChoice(spec) ? spec.options[spec.correct]! : spec.answer;

export const scoreText = (points: number): string =>
  String(Math.round(points * 100) / 100);

export interface ReviewItem {
  id: number;
  prompt: string;
  photo: string;
  yours: string | null;
  right: string;
  points: number;
}

export interface QuizResult {
  score: number;
  total: number;
  review: ReviewItem[];
  stats: QuizStats;
}

export interface QuizStats {
  first: number | null;
  players: number;
  spread: number[];
  friends?: QuizFriendResult[];
}

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

export function spreadOf(scores: readonly number[], total: number): number[] {
  const bars = new Array<number>(total + 1).fill(0);
  for (const score of scores) {
    bars[Math.min(total, Math.max(0, Math.floor(score)))]! += 1;
  }
  return bars;
}

export interface QuizRound {
  question: QuizQuestion;
  right: string;
  answers: { playerId: number; text: string; points: number; at: number }[];
}

export const quizGrade = (points: number): Correctness =>
  points >= 1
    ? Correctness.Correct
    : points > 0
      ? Correctness.PartiallyCorrect
      : Correctness.Incorrect;

export const quizPoints = (points: number): string =>
  `${scoreText(points)} ${points === 1 ? "quiz point" : "quiz points"}`;
