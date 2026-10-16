import { dateToString } from "./date.ts";

// Game State: what the browser remembers about today.

const LOCAL_STORAGE_USED_GUESSES_STRING: string = "usedGuesses";
const LOCAL_STORAGE_VICTORY_STRING: string = "victory"; // no longer stored: victory comes from the server
const LOCAL_STORAGE_DAY_STRING: string = "day";
const LOCAL_STORAGE_GAVE_UP_STRING: string = "gaveUp";
const LOCAL_LAST_PLAYED_STRING: string = "lastPlayed";

// The part of the browser Storage that Game State uses
export interface StateStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface GameState {
  getUsedGuesses(): string[];
  addUsedGuess(guess: string): void;
  setUsedGuesses(guesses: string[]): void;
  // Server Day Number the guesses were graded on, null until a response says
  getDay(): number | null;
  setDay(day: number): void;
  // Whether the player gave up today (the answer was revealed)
  getGaveUp(): boolean;
  setGaveUp(): void;
  // Forgets guesses, day and give-up (a newer day was seen, or the player reset)
  reset(): void;
}

// Blocked storage (private mode, disabled cookies) throws. Writes are kept in
// memory too, so the state still works for this page view.
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
      } catch {
        // kept in memory
      }
    },
    removeItem(key: string): void {
      memory.delete(key);
      try {
        storage.removeItem(key);
      } catch {
        // dropped from memory
      }
    },
  };
}

// Corrupt JSON or a value of the wrong shape reads as missing
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

// Clears guesses and victory unless last played is today (a missing or invalid
// last played counts as another day), then marks today as played.
export function createGameState(
  rawStorage: StateStorage,
  now: () => Date,
): GameState {
  const storage: StateStorage = tolerantStorage(rawStorage);
  const getUsedGuesses = (): string[] => {
    const value: unknown = readJson(storage, LOCAL_STORAGE_USED_GUESSES_STRING);
    if (!Array.isArray(value)) {
      return [];
    }

    return value.filter(
      (item: unknown): item is string => typeof item === "string",
    );
  };

  const today: string = dateToString(now());
  if (readJson(storage, LOCAL_LAST_PLAYED_STRING) !== today) {
    storage.removeItem(LOCAL_STORAGE_VICTORY_STRING);
    storage.removeItem(LOCAL_STORAGE_USED_GUESSES_STRING);
    storage.removeItem(LOCAL_STORAGE_DAY_STRING);
    storage.removeItem(LOCAL_STORAGE_GAVE_UP_STRING);
  }
  storage.setItem(LOCAL_LAST_PLAYED_STRING, JSON.stringify(today));

  return {
    getUsedGuesses,

    addUsedGuess(guess: string): void {
      storage.setItem(
        LOCAL_STORAGE_USED_GUESSES_STRING,
        JSON.stringify([...getUsedGuesses(), guess]),
      );
    },

    setUsedGuesses(guesses: string[]): void {
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

    setDay(day: number): void {
      storage.setItem(LOCAL_STORAGE_DAY_STRING, JSON.stringify(day));
    },

    getGaveUp(): boolean {
      return readJson(storage, LOCAL_STORAGE_GAVE_UP_STRING) === true;
    },

    setGaveUp(): void {
      storage.setItem(LOCAL_STORAGE_GAVE_UP_STRING, "true");
    },

    reset(): void {
      storage.removeItem(LOCAL_STORAGE_GAVE_UP_STRING);
      storage.removeItem(LOCAL_STORAGE_USED_GUESSES_STRING);
      storage.removeItem(LOCAL_STORAGE_DAY_STRING);
    },
  };
}
