import { isImageGame, type GameKind } from "./blur.ts";
import { hintChoices, type HintChoices } from "./free-hint.ts";
import {
  SKIP,
  type Entry,
  type GameAttribute,
  type GradedAttribute,
} from "./game.ts";

export type Ending = "victory" | "lost" | "give-up";

export interface BoardState {
  won: boolean;
  gaveUp?: boolean | undefined;
  lost?: boolean | undefined;
}

export const endingOf = ({ won, gaveUp, lost }: BoardState): Ending | null =>
  won ? "victory" : lost ? "lost" : gaveUp ? "give-up" : null;

export const isOver = (board: BoardState): boolean => endingOf(board) !== null;

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
