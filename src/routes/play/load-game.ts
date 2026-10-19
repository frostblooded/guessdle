// Play's view of a game: what GET /api/games/:slug answers.
import { failureText, UNREACHABLE } from "../../game/failures.ts";
import type { GameKind } from "../../game/blur.ts";
import type { EntryRef, GameAttribute } from "../../game/game.ts";
import type { StatusView } from "./play-status.tsx";
import type { QuizQuestion } from "../../game/quiz.ts";

export type PlayableGame = {
  name: string;
  // Today's Day Number; past days are 0 up to it
  today: number;
  // Day 0's date, "YYYY-MM-DD"
  startDate: string;
  canEdit: boolean;
  // Some entries miss values, so the game cannot be played for now
  paused: boolean;
  kind: GameKind;
  // Blur and Sequence games: tries per day
  blurTries?: number;
  attributes: GameAttribute[];
  // A Blur or Sequence game's entries come without photos; a Quiz game has none
  entries: EntryRef[];
  // Quiz games: the questions, without their answers
  questions?: QuizQuestion[];
} & StatusView;

// A game's GET answer, "missing" for no such game, or the text of why it could not be loaded
export async function loadJson<T>(
  path: string,
): Promise<T | "missing" | string> {
  try {
    const res = await fetch(path);
    if (res.status === 404) {
      return "missing";
    }
    const data = (await res.json().catch(() => null)) as unknown;
    return res.ok
      ? (data as T)
      : failureText((data as { error?: unknown } | null)?.error, res.status);
  } catch {
    return UNREACHABLE;
  }
}

// The game's attributes and entries
export const loadGame = (slug: string) =>
  loadJson<PlayableGame>(`/api/games/${encodeURIComponent(slug)}`);

// Caches a loaded game for the visit, but asks again after a failure
export const gameStaleTime = ({
  state,
}: {
  state: { data?: unknown };
}): number => (typeof state.data === "object" ? Infinity : 0);
