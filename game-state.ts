import { dateToString } from "./date.ts";

// Game State: what the browser remembers about today.

const LOCAL_STORAGE_USED_GUESSES_STRING: string = "usedGuesses";
const LOCAL_STORAGE_VICTORY_STRING: string = "victory";
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
  getIsVictory(): boolean;
  setIsVictory(): void;
  // Clears guesses and victory unless last played is today. Missing or invalid last played counts as another day.
  resetIfNewDay(): void;
  setLastPlayed(): void;
}

// Corrupt JSON or a value of the wrong shape reads as missing
function readJson(storage: StateStorage, key: string): unknown {
  const raw: string | null = storage.getItem(key);
  if (raw === null) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function createGameState(
  storage: StateStorage,
  now: () => Date,
): GameState {
  const getUsedGuesses = (): string[] => {
    const value: unknown = readJson(storage, LOCAL_STORAGE_USED_GUESSES_STRING);
    if (!Array.isArray(value)) return [];

    return value.filter(
      (item: unknown): item is string => typeof item === "string",
    );
  };

  return {
    getUsedGuesses,

    addUsedGuess(guess: string): void {
      storage.setItem(
        LOCAL_STORAGE_USED_GUESSES_STRING,
        JSON.stringify([...getUsedGuesses(), guess]),
      );
    },

    getIsVictory(): boolean {
      return readJson(storage, LOCAL_STORAGE_VICTORY_STRING) === true;
    },

    setIsVictory(): void {
      storage.setItem(LOCAL_STORAGE_VICTORY_STRING, JSON.stringify(true));
    },

    resetIfNewDay(): void {
      const lastPlayed: unknown = readJson(storage, LOCAL_LAST_PLAYED_STRING);
      if (lastPlayed === dateToString(now())) return;

      storage.removeItem(LOCAL_STORAGE_VICTORY_STRING);
      storage.removeItem(LOCAL_STORAGE_USED_GUESSES_STRING);
    },

    setLastPlayed(): void {
      storage.setItem(
        LOCAL_LAST_PLAYED_STRING,
        JSON.stringify(dateToString(now())),
      );
    },
  };
}
