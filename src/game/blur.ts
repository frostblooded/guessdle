// Blur games (ADR 0019): players guess an entry from its square image split into a 3x3 grid.
// At first only one square is clear; each wrong guess clears the next one, in the order the
// owner picked. Pure, so the server, the editor and Play share it.
import { MAX_BLUR_TRIES } from "./limits.ts";

export type GameKind = "classic" | "blur";

export const isGameKind = (value: unknown): value is GameKind =>
  value === "classic" || value === "blur";

// The grid is GRID x GRID squares, numbered 0..CELLS-1 row by row from the top left
export const GRID = 3;
export const CELLS = GRID * GRID;

export const isTryCount = (value: unknown): value is number =>
  Number.isInteger(value) &&
  (value as number) >= 1 &&
  (value as number) <= MAX_BLUR_TRIES;

// A complete clearing order: every cell exactly once
export const isBlurOrder = (value: unknown): value is number[] =>
  Array.isArray(value) &&
  value.length === CELLS &&
  value.every((cell) => Number.isInteger(cell) && cell >= 0 && cell < CELLS) &&
  new Set(value).size === CELLS;

// The editor's click on a cell: an unpicked cell goes last, a picked one leaves the order. When
// one cell is left it goes last on its own, so eight clicks finish the order.
export function toggleCell(order: readonly number[], cell: number): number[] {
  const next = order.includes(cell)
    ? order.filter((c) => c !== cell)
    : [...order, cell];
  if (next.length === CELLS - 1 && !order.includes(cell)) {
    const left = Array.from({ length: CELLS }, (_, i) => i).find(
      (c) => !next.includes(c),
    )!;
    return [...next, left];
  }
  return next;
}

// Where a player is in the day: wrong guesses so far against the game's tries
export interface BlurProgress {
  // Squares clear now, 1..tries
  shown: number;
  // Tries left before the day is lost
  left: number;
  lost: boolean;
}

export function blurProgress(
  wrong: number,
  tries: number,
  finished: boolean,
): BlurProgress {
  const lost = wrong >= tries;
  return {
    shown: finished || lost ? tries : Math.min(wrong + 1, tries),
    left: Math.max(0, tries - wrong),
    lost,
  };
}

// The pixel bounds of a cell in a width x height image; rounding spreads the leftover pixels
export function cellRect(
  cell: number,
  width: number,
  height: number,
): { left: number; top: number; width: number; height: number } {
  const edge = (i: number, of: number): number => Math.round((i * of) / GRID);
  const col = cell % GRID;
  const row = Math.floor(cell / GRID);
  return {
    left: edge(col, width),
    top: edge(row, height),
    width: edge(col + 1, width) - edge(col, width),
    height: edge(row + 1, height) - edge(row, height),
  };
}
