export type GuessMode = "type" | "select";

export const GUESS_MODE_STORAGE_KEY: string = "guess-mode";

export interface GuessModeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function readGuessMode(storage: GuessModeStorage): GuessMode {
  try {
    return storage.getItem(GUESS_MODE_STORAGE_KEY) === "select"
      ? "select"
      : "type";
  } catch {
    return "type";
  }
}

export function writeGuessMode(
  storage: GuessModeStorage,
  mode: GuessMode,
): void {
  try {
    storage.setItem(GUESS_MODE_STORAGE_KEY, mode);
  } catch {}
}

const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

export function filterByName<T extends { name: string }>(
  entries: readonly T[],
  filter: string,
): T[] {
  const lower = filter.trim().toLowerCase();
  return entries
    .filter((entry) => entry.name.toLowerCase().includes(lower))
    .sort((a, b) => collator.compare(a.name, b.name));
}
