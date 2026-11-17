import { hintOffer, isOver } from "../game/board.ts";
import type pg from "pg";
import { isImageGame, outOfTries } from "../game/blur.ts";
import type { HintChoices } from "../game/free-hint.ts";
import { gradeIds, type Entry, type GradedAttribute } from "../game/game.ts";
import { playBlocker, type LoadedGame } from "./access.ts";
import { dateOfDay } from "../game/date.ts";
import { dayNumber, ensureAnswer, todayIn } from "./answers.ts";
import type { GameRow, Roster } from "./games.ts";

export interface PlayDay {
  game: GameRow;
  roster: Roster;
  answer: Entry;
  revision: number;
  date: string;
  day: number;
  past: boolean;
}

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

export function todayOf(
  { now, timeZone }: Clock,
  game: GameRow,
): { date: string; day: number } {
  const date = todayIn(now(), timeZone);
  return { date, day: dayNumber(date, game.startDate) };
}

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

export async function openDay(
  { pool, random, ...clock }: Clock & { pool: pg.Pool; random: () => number },
  { game, roster }: Pick<LoadedGame, "game" | "roster">,
  raw: unknown,
  accepts: () => boolean = () => true,
): Promise<PlayDay | DayRefusal> {
  const played = dayOf(clock, game, raw);
  if (!played || game.kind === "quiz") {
    return { refusal: "no_such_day" };
  }
  const { date, day } = played;
  if (!accepts()) {
    return { refusal: "invalid", day };
  }
  const blocker = playBlocker(roster);
  if (blocker) {
    return { refusal: blocker, day };
  }
  const stored = await ensureAnswer(pool, game, roster.answerIds, date, random);
  const answer = roster.all.find((entry) => entry.id === stored?.entryId);
  return answer
    ? { game, roster, answer, revision: stored!.revision, ...played }
    : { refusal: "answer_missing", day };
}

export const triesOf = (game: GameRow): number | null =>
  isImageGame(game.kind) ? game.blurTries : null;

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

export const isLost = (
  game: GameRow,
  ids: readonly number[],
  victory: boolean,
): boolean => outOfTries(triesOf(game), ids.length, victory);

export interface Board {
  rows: GradedAttribute[][];
  victory: boolean;
  lost: boolean;
  reveal: Reveal | null;
  hints: HintChoices | null;
}

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
  const over = isOver({ won: graded.victory, gaveUp, lost });
  return {
    rows: graded.rows,
    victory: graded.victory,
    lost,
    reveal: over ? revealOf(game, answer) : null,
    hints: hintOffer(game.kind, roster.attributes, answer, graded.rows, {
      over,
      used: false,
    }),
  };
}
