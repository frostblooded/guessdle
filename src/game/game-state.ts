import { dateToString } from "./date.ts";
import { isFreeHint, type FreeHint } from "./free-hint.ts";
import type { DayProgress } from "./days.ts";

const LOCAL_STORAGE_USED_GUESSES_STRING: string = "usedGuesses";
const LOCAL_STORAGE_VICTORY_STRING: string = "victory";
const LOCAL_STORAGE_DAY_STRING: string = "day";
const LOCAL_STORAGE_REVISION_STRING: string = "revision";
const LOCAL_STORAGE_GAVE_UP_STRING: string = "gaveUp";
const LOCAL_LAST_PLAYED_STRING: string = "lastPlayed";
const LOCAL_STORAGE_HINT_STRING: string = "hint";

export interface StateStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface GameState {
  getUsedGuesses(): number[];
  addUsedGuess(guess: number): void;
  setUsedGuesses(guesses: number[]): void;
  getDay(): number | null;
  getRevision(): number | null;
  setDay(day: number, revision?: number): void;
  getGaveUp(): boolean;
  setGaveUp(): void;
  getWon(): boolean;
  setWon(): void;
  getHint(): FreeHint | null;
  setHint(hint: FreeHint): void;
  reset(): void;
}

export function wipeLegacyState(storage: StateStorage): boolean {
  let found = false;
  for (const key of [
    LOCAL_STORAGE_USED_GUESSES_STRING,
    LOCAL_STORAGE_VICTORY_STRING,
    LOCAL_STORAGE_DAY_STRING,
    LOCAL_STORAGE_GAVE_UP_STRING,
    LOCAL_LAST_PLAYED_STRING,
  ]) {
    found ||= storage.getItem(key) !== null;
    storage.removeItem(key);
  }
  return found;
}

export function forgetAllGames(
  storage: StateStorage & Pick<Storage, "length" | "key">,
): void {
  const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i));
  for (const key of keys) {
    if (key?.startsWith("game:")) {
      storage.removeItem(key);
    }
  }
}

export function pastDayStorage(
  storage: StateStorage,
  slug: string,
  day: number,
): StateStorage {
  return gameStorage(storage, `${slug}:day:${day}`);
}

const FIRST_GUESS_KEY = "firstGuessAt";

export function boardClock(
  storage: StateStorage | undefined,
  day: () => number | null,
  now: () => number = Date.now,
): { startClock(): void; solveSeconds(): number | null } {
  return {
    startClock(): void {
      try {
        storage?.setItem(FIRST_GUESS_KEY, JSON.stringify([day(), now()]));
      } catch {}
    },
    solveSeconds(): number | null {
      try {
        const [started, at]: unknown[] = JSON.parse(
          storage?.getItem(FIRST_GUESS_KEY) ?? "[]",
        ) as unknown[];
        return started === day() && Number(at) > 0
          ? Math.max(0, Math.round((now() - Number(at)) / 1000))
          : null;
      } catch {
        return null;
      }
    },
  };
}

export function gameStorage(storage: StateStorage, slug: string): StateStorage {
  const key = (name: string): string => `game:${slug}:${name}`;
  return {
    getItem: (name: string): string | null => storage.getItem(key(name)),
    setItem: (name: string, value: string): void =>
      storage.setItem(key(name), value),
    removeItem: (name: string): void => storage.removeItem(key(name)),
  };
}

function tolerantStorage(storage: StateStorage): StateStorage {
  const memory: Map<string, string> = new Map();
  return {
    getItem(key: string): string | null {
      try {
        return storage.getItem(key);
      } catch {
        return memory.get(key) ?? null;
      }
    },
    setItem(key: string, value: string): void {
      memory.set(key, value);
      try {
        storage.setItem(key, value);
      } catch {}
    },
    removeItem(key: string): void {
      memory.delete(key);
      try {
        storage.removeItem(key);
      } catch {}
    },
  };
}

function readJson(storage: StateStorage, key: string): unknown {
  const raw: string | null = storage.getItem(key);
  if (raw === null) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function readProgress(
  rawStorage: StateStorage,
  now: () => Date,
  expires: boolean,
): DayProgress {
  const storage: StateStorage = tolerantStorage(rawStorage);
  if (
    expires &&
    readJson(storage, LOCAL_LAST_PLAYED_STRING) !== dateToString(now())
  ) {
    return { won: false, gaveUp: false, guesses: 0 };
  }
  return {
    won: readJson(storage, LOCAL_STORAGE_VICTORY_STRING) === true,
    gaveUp: readJson(storage, LOCAL_STORAGE_GAVE_UP_STRING) === true,
    guesses: usedGuessesIn(storage).length,
  };
}

function usedGuessesIn(storage: StateStorage): number[] {
  const value: unknown = readJson(storage, LOCAL_STORAGE_USED_GUESSES_STRING);
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item: unknown): item is number =>
    Number.isInteger(item),
  );
}

export function createGameState(
  rawStorage: StateStorage,
  now: () => Date,
  expires: boolean = true,
): GameState {
  const storage: StateStorage = tolerantStorage(rawStorage);
  const getUsedGuesses = (): number[] => usedGuessesIn(storage);

  const today: string = dateToString(now());
  if (expires && readJson(storage, LOCAL_LAST_PLAYED_STRING) !== today) {
    storage.removeItem(LOCAL_STORAGE_VICTORY_STRING);
    storage.removeItem(LOCAL_STORAGE_USED_GUESSES_STRING);
    storage.removeItem(LOCAL_STORAGE_DAY_STRING);
    storage.removeItem(LOCAL_STORAGE_REVISION_STRING);
    storage.removeItem(LOCAL_STORAGE_GAVE_UP_STRING);
    storage.removeItem(LOCAL_STORAGE_HINT_STRING);
  }
  storage.setItem(LOCAL_LAST_PLAYED_STRING, JSON.stringify(today));

  return {
    getUsedGuesses,

    addUsedGuess(guess: number): void {
      storage.setItem(
        LOCAL_STORAGE_USED_GUESSES_STRING,
        JSON.stringify([...getUsedGuesses(), guess]),
      );
    },

    setUsedGuesses(guesses: number[]): void {
      storage.setItem(
        LOCAL_STORAGE_USED_GUESSES_STRING,
        JSON.stringify(guesses),
      );
    },

    getDay(): number | null {
      const value: unknown = readJson(storage, LOCAL_STORAGE_DAY_STRING);
      return Number.isInteger(value) && (value as number) >= 0
        ? (value as number)
        : null;
    },

    getRevision(): number | null {
      const value: unknown = readJson(storage, LOCAL_STORAGE_REVISION_STRING);
      return Number.isInteger(value) ? (value as number) : null;
    },

    setDay(day: number, revision?: number): void {
      storage.setItem(LOCAL_STORAGE_DAY_STRING, JSON.stringify(day));
      if (revision !== undefined) {
        storage.setItem(
          LOCAL_STORAGE_REVISION_STRING,
          JSON.stringify(revision),
        );
      }
    },

    getGaveUp(): boolean {
      return readJson(storage, LOCAL_STORAGE_GAVE_UP_STRING) === true;
    },

    setGaveUp(): void {
      storage.setItem(LOCAL_STORAGE_GAVE_UP_STRING, "true");
    },

    getWon(): boolean {
      return readJson(storage, LOCAL_STORAGE_VICTORY_STRING) === true;
    },

    setWon(): void {
      storage.setItem(LOCAL_STORAGE_VICTORY_STRING, "true");
    },

    getHint(): FreeHint | null {
      const value: unknown = readJson(storage, LOCAL_STORAGE_HINT_STRING);
      return isFreeHint(value) ? value : null;
    },

    setHint(hint: FreeHint): void {
      storage.setItem(LOCAL_STORAGE_HINT_STRING, JSON.stringify(hint));
    },

    reset(): void {
      storage.removeItem(LOCAL_STORAGE_VICTORY_STRING);
      storage.removeItem(LOCAL_STORAGE_GAVE_UP_STRING);
      storage.removeItem(LOCAL_STORAGE_USED_GUESSES_STRING);
      storage.removeItem(LOCAL_STORAGE_DAY_STRING);
      storage.removeItem(LOCAL_STORAGE_HINT_STRING);
      storage.removeItem(LOCAL_STORAGE_REVISION_STRING);
    },
  };
}
