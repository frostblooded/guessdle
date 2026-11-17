import { MAX_BLUR_TRIES } from "./limits.ts";

export type GameKind = "classic" | "blur" | "sequence" | "quiz";

export const isGameKind = (value: unknown): value is GameKind =>
  value === "classic" ||
  value === "blur" ||
  value === "sequence" ||
  value === "quiz";

export const isImageGame = (kind: GameKind): boolean =>
  kind === "blur" || kind === "sequence";

export const outOfTries = (
  tries: number | null | undefined,
  guesses: number,
  won: boolean,
): boolean => tries !== null && tries !== undefined && !won && guesses >= tries;

export const GRID = 3;
export const CELLS = GRID * GRID;

export const isTryCount = (value: unknown): value is number =>
  Number.isInteger(value) &&
  (value as number) >= 1 &&
  (value as number) <= MAX_BLUR_TRIES;

export const isBlurOrder = (value: unknown): value is number[] =>
  Array.isArray(value) &&
  value.length === CELLS &&
  value.every((cell) => Number.isInteger(cell) && cell >= 0 && cell < CELLS) &&
  new Set(value).size === CELLS;

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

export interface BlurProgress {
  shown: number;
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
