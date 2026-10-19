// A Day of play: one game on one day (today, or a Past Day) with its Daily Answer. It decides
// which day a request plays, draws the answer, grades a list of guesses against it, says when
// the day is over and what that reveals, and records a first win in the day's stats. Routes
// only read the request and turn these outcomes into HTTP replies.
import type pg from "pg";
import { isImageGame, outOfTries } from "../game/blur.ts";
import { hintChoices, type HintChoices } from "../game/free-hint.ts";
import { gradeIds, type Entry, type GradedAttribute } from "../game/game.ts";
import { MAX_SECONDS, type DayStats } from "../game/stats.ts";
import { playBlocker, type LoadedGame } from "./access.ts";
import { dateOfDay, dayNumber, ensureAnswer, todayIn } from "./answers.ts";
import type { GameRow, Roster } from "./games.ts";
import { dayStats, recordResult } from "./results.ts";

export interface PlayDay {
  game: GameRow;
  roster: Roster;
  answer: Entry;
  // Bumped each time an override changed the day's answer (migration 018)
  revision: number;
  // "YYYY-MM-DD" in the server time zone, and its Day Number
  date: string;
  day: number;
  // A Past Day (not today), played from the Past days list
  past: boolean;
}

// Why a day cannot be played. `day` is set once the requested day is known.
export type DayRefusal =
  | { refusal: "no_such_day" }
  | {
      refusal:
        "invalid" | "not_enough_entries" | "game_paused" | "answer_missing";
      day: number;
    };

export interface Clock {
  now: () => Date;
  timeZone: string;
}

// Today's date and Day Number in the game's calendar
export function todayOf(
  { now, timeZone }: Clock,
  game: GameRow,
): { date: string; day: number } {
  const date = todayIn(now(), timeZone);
  return { date, day: dayNumber(date, game.startDate) };
}

// The day a request plays: today when `raw` (the `?day=` query) is absent, else a Day Number
// from 0 up to today; null for anything else
export function dayOf(
  clock: Clock,
  game: GameRow,
  raw: unknown,
): { date: string; day: number; past: boolean } | null {
  const today = todayOf(clock, game);
  if (raw === undefined) {
    return { ...today, past: false };
  }
  if (typeof raw !== "string" || !/^\d{1,6}$/.test(raw)) {
    return null;
  }
  const day = Number(raw);
  if (day > today.day) {
    return null;
  }
  return {
    date: dateOfDay(day, game.startDate),
    day,
    past: day !== today.day,
  };
}

// The day `raw` names with its answer, drawn (and stored) on first request. `accepts` checks
// the rest of the request once the day is known: a request it refuses ("invalid") draws nothing.
export async function openDay(
  { pool, random, ...clock }: Clock & { pool: pg.Pool; random: () => number },
  { game, roster }: Pick<LoadedGame, "game" | "roster">,
  raw: unknown,
  accepts: () => boolean = () => true,
): Promise<PlayDay | DayRefusal> {
  const played = dayOf(clock, game, raw);
  // A Quiz game has no days: it is taken whole, any time (ADR 0021)
  if (!played || game.kind === "quiz") {
    return { refusal: "no_such_day" };
  }
  const { date, day } = played;
  if (!accepts()) {
    return { refusal: "invalid", day };
  }
  // Only the owner and admins reach a game too small to draw an answer from
  const blocker = playBlocker(game, roster);
  if (blocker) {
    return { refusal: blocker, day };
  }
  const stored = await ensureAnswer(pool, game, roster.answerIds, date, random);
  const answer = roster.all.find((entry) => entry.id === stored?.entryId);
  return answer
    ? { game, roster, answer, revision: stored!.revision, ...played }
    : { refusal: "answer_missing", day };
}

// A Blur or Sequence game's tries, null for a classic game with unlimited guesses
export const triesOf = (game: GameRow): number | null =>
  isImageGame(game.kind) ? game.blurTries : null;

// The answer as a finished day reveals it: its name, its description when it has one, and a
// Blur game's whole image or a Sequence game's first photo
export interface Reveal {
  answer: string;
  answerPhoto?: string;
  answerDescription?: string;
}

export const revealOf = (game: GameRow, answer: Entry): Reveal => ({
  answer: answer.name,
  ...(game.kind === "blur" && { answerPhoto: answer.photo }),
  ...(game.kind === "sequence" &&
    answer.shots?.[0] && { answerPhoto: answer.shots[0] }),
  ...(answer.description && { answerDescription: answer.description }),
});

// Whether `ids` used up a Blur or Sequence game's tries without the answer
export const isLost = (
  game: GameRow,
  ids: readonly number[],
  victory: boolean,
): boolean => outOfTries(triesOf(game), ids.length, victory);

// A list of guesses graded against the day's answer. `reveal` is set once the day is over:
// won, given up, or (Blur and Sequence games) every try used.
export interface Board {
  rows: GradedAttribute[][];
  victory: boolean;
  lost: boolean;
  reveal: Reveal | null;
  // Classic games, while the day is on: the Free Hint kinds these guesses earn (whether one
  // was already used is the caller's to know)
  hints: HintChoices | null;
}

// Grades guesses by entry id (soft-deleted entries still resolve, so old guesses keep their
// rows); "invalid" for an unknown id, "duplicate" for a repeated one
export function boardOf(
  { game, roster, answer }: Pick<PlayDay, "game" | "roster" | "answer">,
  ids: readonly number[],
  gaveUp: boolean = false,
): Board | "invalid" | "duplicate" {
  const graded = gradeIds(
    roster.attributes,
    roster.all,
    answer,
    ids,
    game.kind,
  );
  if (graded.kind !== "graded") {
    return graded.kind;
  }
  const lost = isLost(game, ids, graded.victory);
  const over = graded.victory || gaveUp || lost;
  return {
    rows: graded.rows,
    victory: graded.victory,
    lost,
    reveal: over ? revealOf(game, answer) : null,
    hints:
      game.kind === "classic" && !over
        ? hintChoices(roster.attributes, answer, graded.rows)
        : null,
  };
}

// Records `player`'s first win of the day and answers with the day's stats. `ids` must be a
// gradable list ending with the answer; `seconds` outside 0 to MAX_SECONDS is kept as unknown.
// A replay after a reset changes nothing.
export async function recordWin(
  q: Pick<pg.Pool, "query">,
  day: PlayDay,
  player: string,
  ids: readonly number[],
  seconds: unknown,
): Promise<DayStats | "not_won"> {
  const board = boardOf(day, ids);
  if (typeof board === "string" || ids.at(-1) !== day.answer.id) {
    return "not_won";
  }
  const key = { gameId: day.game.id, date: day.date, player };
  await recordResult(q, key, {
    guesses: ids.length,
    seconds:
      Number.isInteger(seconds) &&
      (seconds as number) >= 0 &&
      (seconds as number) <= MAX_SECONDS
        ? (seconds as number)
        : null,
  });
  return dayStats(q, key, day.day);
}
