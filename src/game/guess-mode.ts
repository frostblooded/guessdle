// Guess mode: typing a name with autocomplete, or picking it from a list of every entry.
// The choice is remembered in the browser for every game, like Theme.
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

const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

// Selection mode's list: the entries whose name contains the filter text (any letter case), by name
export function filterByName<T extends { name: string }>(
  entries: readonly T[],
  filter: string,
): T[] {
  const lower = filter.trim().toLowerCase();
  return entries
    .filter((entry) => entry.name.toLowerCase().includes(lower))
    .sort((a, b) => collator.compare(a.name, b.name));
}
