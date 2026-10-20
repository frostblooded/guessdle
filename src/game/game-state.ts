import { dateToString } from "./date.ts";
import { isFreeHint, type FreeHint } from "./free-hint.ts";
import type { DayProgress } from "./days.ts";

// Game State: what the browser remembers about today.

const LOCAL_STORAGE_USED_GUESSES_STRING: string = "usedGuesses";
// Only a hint for the Past days list: the board's victory always comes from the server
const LOCAL_STORAGE_VICTORY_STRING: string = "victory";
const LOCAL_STORAGE_DAY_STRING: string = "day";
const LOCAL_STORAGE_REVISION_STRING: string = "revision";
const LOCAL_STORAGE_GAVE_UP_STRING: string = "gaveUp";
const LOCAL_LAST_PLAYED_STRING: string = "lastPlayed";
// The Free Hint the player used, as the server drew it
const LOCAL_STORAGE_HINT_STRING: string = "hint";

// The part of the browser Storage that Game State uses
export interface StateStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface GameState {
  // Entry ids
  getUsedGuesses(): number[];
  addUsedGuess(guess: number): void;
  setUsedGuesses(guesses: number[]): void;
  // Server Day Number the guesses were graded on, null until a response says
  getDay(): number | null;
  // The answer's revision the guesses were graded on, null until a response says
  getRevision(): number | null;
  setDay(day: number, revision?: number): void;
  // Whether the player gave up today (the answer was revealed)
  getGaveUp(): boolean;
  setGaveUp(): void;
  // Whether a server reply said the guesses won
  getWon(): boolean;
  setWon(): void;
  // The Free Hint used today, null while unused
  getHint(): FreeHint | null;
  setHint(hint: FreeHint): void;
  // Forgets guesses, day, give-up and hint (a newer day was seen, or the player reset)
  reset(): void;
}

// Before games had slugs the keys had no prefix (spec #66): forget them once
// Returns whether any existed, so the shell can tell the player once
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

// Signing out: every game's local state goes, whichever game page we are on
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

// One past day's keys inside a game's, so archive play never touches today's
export function pastDayStorage(
  storage: StateStorage,
  slug: string,
  day: number,
): StateStorage {
  return gameStorage(storage, `${slug}:day:${day}`);
}

// When the current board's first guess was made on this browser: [Day Number, ms since the epoch]
const FIRST_GUESS_KEY = "firstGuessAt";

// The solve clock of one board, kept with its storage: started on a fresh board's first guess,
// read when the board is won. Blocked storage leaves the time unknown.
export function boardClock(
  storage: StateStorage | undefined,
  day: () => number | null,
  now: () => number = Date.now,
): { startClock(): void; solveSeconds(): number | null } {
  return {
    startClock(): void {
      try {
        storage?.setItem(FIRST_GUESS_KEY, JSON.stringify([day(), now()]));
      } catch {
        // the time stays unknown
      }
    },
    // Whole seconds since the first guess, or null when this browser did not see this day's
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

// One game's keys inside the shared browser storage, so games never share state
export function gameStorage(storage: StateStorage, slug: string): StateStorage {
  const key = (name: string): string => `game:${slug}:${name}`;
  return {
    getItem: (name: string): string | null => storage.getItem(key(name)),
    setItem: (name: string, value: string): void =>
      storage.setItem(key(name), value),
    removeItem: (name: string): void => storage.removeItem(key(name)),
  };
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

// What a board's stored Game State says was played, without writing anything: the Past days
// list reads every day this way. Today's board (`expires`) reads as unplayed once its last
// played date is not today, as createGameState would clear it.
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

// The stored entry ids; anything else reads as none
function usedGuessesIn(storage: StateStorage): number[] {
  const value: unknown = readJson(storage, LOCAL_STORAGE_USED_GUESSES_STRING);
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item: unknown): item is number =>
    Number.isInteger(item),
  );
}

// Clears guesses and victory unless last played is today (a missing or invalid
// last played counts as another day), then marks today as played. A past day's
// state (`expires` false) is kept for good.
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
