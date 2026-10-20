// One player's Board: their Guesses against one answer, in solo play (server and page) and
// in a Party Round. Pure rules shared by every place that plays one: when it is over and
// how, which guess it takes next, and when it offers the Free Hint.
import { isImageGame, type GameKind } from "./blur.ts";
import { hintChoices, type HintChoices } from "./free-hint.ts";
import {
  SKIP,
  type Entry,
  type GameAttribute,
  type GradedAttribute,
} from "./game.ts";

// How a Board ended. A win beats running out of tries, which beats giving up.
export type Ending = "victory" | "lost" | "give-up";

export interface BoardState {
  won: boolean;
  gaveUp?: boolean | undefined;
  lost?: boolean | undefined;
}

export const endingOf = ({ won, gaveUp, lost }: BoardState): Ending | null =>
  won ? "victory" : lost ? "lost" : gaveUp ? "give-up" : null;

export const isOver = (board: BoardState): boolean => endingOf(board) !== null;

// Whether a Board takes `id` as its next guess: an active entry it has not guessed yet, or in
// a Blur or Sequence game SKIP, as often as it likes
export function checkGuess(
  kind: GameKind,
  active: readonly { id: number }[],
  guessed: readonly number[],
  id: unknown,
): "ok" | "invalid" | "duplicate" {
  if (id === SKIP && isImageGame(kind)) {
    return "ok";
  }
  if (typeof id !== "number" || !active.some((e) => e.id === id)) {
    return "invalid";
  }
  return guessed.includes(id) ? "duplicate" : "ok";
}

// The Free Hint kinds a Board offers: a Classic game's, while it is not over and its hint is
// unused, once enough guesses are wrong
export const hintOffer = (
  kind: GameKind,
  attributes: readonly GameAttribute[],
  answer: Entry,
  rows: readonly GradedAttribute[][],
  { over, used }: { over: boolean; used: boolean },
): HintChoices | null =>
  kind === "classic" && !over && !used
    ? hintChoices(attributes, answer, rows)
    : null;
