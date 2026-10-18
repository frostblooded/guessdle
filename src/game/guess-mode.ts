// Guess mode: typing a name with autocomplete, or picking it from a list of every entry.
// The choice is remembered in the browser for every game, like Theme.
import type { AttributeValue } from "./correctness.ts";
import type { AttributeType } from "./game.ts";

export type GuessMode = "type" | "select";

export const GUESS_MODE_STORAGE_KEY: string = "guess-mode";

export interface GuessModeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

// Missing, unknown or unreadable (blocked storage) reads as type
export function readGuessMode(storage: GuessModeStorage): GuessMode {
  try {
    return storage.getItem(GUESS_MODE_STORAGE_KEY) === "select"
      ? "select"
      : "type";
  } catch {
    return "type";
  }
}

// Blocked storage keeps the choice for this page view only
export function writeGuessMode(
  storage: GuessModeStorage,
  mode: GuessMode,
): void {
  try {
    storage.setItem(GUESS_MODE_STORAGE_KEY, mode);
  } catch {
    // ignored on purpose
  }
}

// One entry as the selection list shows it: values in attribute order (none for a Blur game)
export interface ListEntry {
  name: string;
  photo: string;
  values: readonly AttributeValue[];
}

// The column the list is sorted by: -1 for the name, else an attribute's index
export interface ListSort {
  column: number;
  descending: boolean;
}

export const cellText = (value: AttributeValue | undefined): string =>
  Array.isArray(value) ? value.join(", ") : (value ?? "");

const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

// Entries whose name contains the filter text (any letter case), sorted by the column; Numbers
// sort by value, and ties fall back to the name
export function listEntries<T extends ListEntry>(
  entries: readonly T[],
  types: readonly AttributeType[],
  filter: string,
  sort: ListSort,
): T[] {
  const lower = filter.trim().toLowerCase();
  const byName = (a: T, b: T): number => collator.compare(a.name, b.name);
  const byColumn = (a: T, b: T): number => {
    if (sort.column < 0) {
      return byName(a, b);
    }
    const x = a.values[sort.column];
    const y = b.values[sort.column];
    if (types[sort.column] === "number") {
      return Number(cellText(x)) - Number(cellText(y));
    }
    return collator.compare(cellText(x), cellText(y));
  };
  const sign = sort.descending ? -1 : 1;
  return entries
    .filter((entry) => entry.name.toLowerCase().includes(lower))
    .sort((a, b) => sign * byColumn(a, b) || byName(a, b));
}

// Tapping the sorted column flips its order; another column sorts ascending
export const nextSort = (sort: ListSort, column: number): ListSort =>
  sort.column === column
    ? { column, descending: !sort.descending }
    : { column, descending: false };
