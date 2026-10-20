import assert from "node:assert/strict";
import { beforeEach, describe, it } from "vitest";
import {
  boardClock,
  createGameState,
  type GameState,
  type StateStorage,
  gameStorage,
  pastDayStorage,
  readProgress,
  forgetAllGames,
  wipeLegacyState,
} from "../src/game/game-state.ts";

class MemoryStorage implements StateStorage {
  readonly items: Map<string, string> = new Map();

  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }

  removeItem(key: string): void {
    this.items.delete(key);
  }

  get length(): number {
    return this.items.size;
  }

  key(index: number): string | null {
    return [...this.items.keys()][index] ?? null;
  }
}

const MONDAY = new Date(2025, 9, 6, 9, 0);
const MONDAY_NIGHT = new Date(2025, 9, 6, 23, 59);
const TUESDAY = new Date(2025, 9, 7, 0, 1);

let storage: MemoryStorage;
let today: Date;
let state: GameState;

beforeEach(() => {
  storage = new MemoryStorage();
  today = MONDAY;
  state = createGameState(storage, () => today);
});

describe("used guesses", () => {
  it("starts empty", () => {
    assert.deepEqual(state.getUsedGuesses(), []);
  });

  it("keeps guesses in the order they were added", () => {
    state.addUsedGuess(1);
    state.addUsedGuess(2);
    assert.deepEqual(state.getUsedGuesses(), [1, 2]);
  });

  it("survives a new instance over the same storage", () => {
    state.addUsedGuess(1);
    const reloaded = createGameState(storage, () => today);
    assert.deepEqual(reloaded.getUsedGuesses(), [1]);
  });

  it("reads corrupt JSON as empty and recovers on the next add", () => {
    storage.setItem("usedGuesses", "{not json");
    assert.deepEqual(state.getUsedGuesses(), []);
    state.addUsedGuess(1);
    assert.deepEqual(state.getUsedGuesses(), [1]);
  });

  it("reads a non-array value as empty", () => {
    storage.setItem("usedGuesses", JSON.stringify({ a: 1 }));
    assert.deepEqual(state.getUsedGuesses(), []);
  });

  it("drops non-integer entries", () => {
    storage.setItem("usedGuesses", JSON.stringify([1, "Oreo", 7.5, null, 2]));
    assert.deepEqual(state.getUsedGuesses(), [1, 2]);
  });
});

describe("server day", () => {
  it("starts unknown", () => {
    assert.equal(state.getDay(), null);
  });

  it("keeps the day number across a new instance on the same day", () => {
    state.setDay(427);
    assert.equal(createGameState(storage, () => today).getDay(), 427);
  });

  it("reads corrupt or non-integer values as unknown", () => {
    for (const value of ["{bad", '"427"', "null", "1.5", "-1", "[1]"]) {
      storage.setItem("day", value);
      assert.equal(state.getDay(), null, value);
    }
  });

  it("is cleared together with the guesses by reset", () => {
    state.addUsedGuess(1);
    state.setDay(3);
    state.reset();
    assert.deepEqual(state.getUsedGuesses(), []);
    assert.equal(state.getDay(), null);
  });

  it("is cleared with the guesses on the next local day", () => {
    state.setDay(3);
    today = TUESDAY;
    assert.equal(createGameState(storage, () => today).getDay(), null);
  });
});

describe("last played and the new-day reset", () => {
  const play = (): void => {
    state.addUsedGuess(1);
    state.setDay(5);
  };
  const open = (): GameState => createGameState(storage, () => today);

  it("keeps state when reopened on the same day", () => {
    play();
    const reopened = open();
    assert.deepEqual(reopened.getUsedGuesses(), [1]);
    assert.equal(reopened.getDay(), 5);
  });

  it("keeps state when reopened later the same day, even just before midnight", () => {
    play();
    today = MONDAY_NIGHT;
    assert.deepEqual(open().getUsedGuesses(), [1]);
  });

  it("clears guesses and victory on the next day", () => {
    play();
    today = TUESDAY;
    const reopened = open();
    assert.deepEqual(reopened.getUsedGuesses(), []);
    assert.equal(reopened.getDay(), null);
  });

  it("clears state when last played is a past month or year", () => {
    play();
    today = new Date(2026, 0, 1);
    assert.deepEqual(open().getUsedGuesses(), []);
  });

  it("clears state when last played is missing", () => {
    storage.removeItem("lastPlayed");
    play();
    const reopened = open();
    assert.deepEqual(reopened.getUsedGuesses(), []);
    assert.equal(reopened.getDay(), null);
  });

  it("clears state when last played is corrupt or the wrong type", () => {
    for (const value of ["{bad", "42", "null", '["2025-10-6"]']) {
      play();
      storage.setItem("lastPlayed", value);
      assert.deepEqual(open().getUsedGuesses(), [], value);
    }
  });

  it("drops the victory flag older versions stored", () => {
    storage.setItem("lastPlayed", JSON.stringify("2025-10-5"));
    storage.setItem("victory", "true");
    open();
    assert.equal(storage.getItem("victory"), null);
  });

  it("starts empty on a fresh storage", () => {
    assert.deepEqual(state.getUsedGuesses(), []);
    assert.equal(state.getDay(), null);
  });

  it("marks today as played so a later open the same day keeps state", () => {
    today = TUESDAY;
    const tuesday = open();
    tuesday.addUsedGuess(2);
    assert.deepEqual(open().getUsedGuesses(), [2]);
  });
});

describe("blocked storage", () => {
  const blocked: StateStorage = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
    removeItem: () => {
      throw new Error("blocked");
    },
  };

  it("opens empty without throwing", () => {
    const blockedState = createGameState(blocked, () => today);
    assert.deepEqual(blockedState.getUsedGuesses(), []);
    assert.equal(blockedState.getDay(), null);
  });

  it("keeps guesses and day for this page view", () => {
    const blockedState = createGameState(blocked, () => today);
    blockedState.addUsedGuess(1);
    blockedState.addUsedGuess(2);
    blockedState.setDay(9);
    assert.deepEqual(blockedState.getUsedGuesses(), [1, 2]);
    assert.equal(blockedState.getDay(), 9);
  });
});

describe("gameStorage", () => {
  it("keeps each game's keys apart in the shared storage", () => {
    const a = createGameState(gameStorage(storage, "a"), () => today);
    const b = createGameState(gameStorage(storage, "b"), () => today);
    a.addUsedGuess(1);
    assert.deepEqual(a.getUsedGuesses(), [1]);
    assert.deepEqual(b.getUsedGuesses(), []);
    assert.equal(storage.getItem("game:a:usedGuesses"), "[1]");
  });
});

describe("a past day's state", () => {
  it("lives under its own keys and never expires", () => {
    const past = (): GameState =>
      createGameState(pastDayStorage(storage, "a", 3), () => today, false);
    past().addUsedGuess(1);
    past().setGaveUp();
    assert.equal(storage.getItem("game:a:day:3:usedGuesses"), "[1]");
    today = TUESDAY;
    assert.deepEqual(past().getUsedGuesses(), [1]);
    assert.equal(past().getGaveUp(), true);
    assert.deepEqual(
      createGameState(gameStorage(storage, "a"), () => today).getUsedGuesses(),
      [],
    );
  });

  it("remembers a win until reset", () => {
    state.setWon();
    assert.equal(state.getWon(), true);
    state.reset();
    assert.equal(state.getWon(), false);
  });
});

describe("storage keys", () => {
  it("writes the keys returning players already have stored", () => {
    state.addUsedGuess(1);
    state.setDay(7);
    assert.deepEqual(Object.fromEntries(storage.items), {
      usedGuesses: "[1]",
      day: "7",
      lastPlayed: '"2025-10-6"',
    });
  });
});

describe("gave up", () => {
  it("starts false and is kept across a new instance on the same day", () => {
    assert.equal(state.getGaveUp(), false);
    state.setGaveUp();
    assert.equal(state.getGaveUp(), true);
    assert.equal(
      createGameState(storage, () => MONDAY_NIGHT).getGaveUp(),
      true,
    );
  });

  it("is cleared by reset", () => {
    state.setGaveUp();
    state.reset();
    assert.equal(state.getGaveUp(), false);
    assert.equal(storage.items.has("gaveUp"), false);
  });

  it("is cleared on the next local day", () => {
    state.setGaveUp();
    assert.equal(createGameState(storage, () => TUESDAY).getGaveUp(), false);
  });

  it("reads anything but true as false", () => {
    storage.setItem("gaveUp", "garbage");
    assert.equal(state.getGaveUp(), false);
    storage.setItem("gaveUp", '"true"');
    assert.equal(state.getGaveUp(), false);
  });

  it("is kept in memory when storage is blocked", () => {
    const blocked: StateStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    const blockedState = createGameState(blocked, () => today);
    blockedState.setGaveUp();
    assert.equal(blockedState.getGaveUp(), true);
  });
});

describe("wipeLegacyState", () => {
  it("removes the un-namespaced keys and keeps per-game and other keys", () => {
    for (const key of [
      "usedGuesses",
      "victory",
      "day",
      "gaveUp",
      "lastPlayed",
    ]) {
      storage.setItem(key, "1");
    }
    storage.setItem("game:petdle:usedGuesses", "[1]");
    storage.setItem("theme", "dark");
    assert.equal(wipeLegacyState(storage), true);
    assert.deepEqual([...storage.items.keys()].sort(), [
      "game:petdle:usedGuesses",
      "theme",
    ]);
  });
});

describe("wipeLegacyState result", () => {
  beforeEach(() => storage.items.clear());
  it("says whether anything was removed, so the reset is announced once", () => {
    assert.equal(wipeLegacyState(storage), false);
    storage.setItem("usedGuesses", "[1]");
    assert.equal(wipeLegacyState(storage), true);
    assert.equal(wipeLegacyState(storage), false);
  });
});

describe("forgetAllGames", () => {
  beforeEach(() => storage.items.clear());
  it("removes every game's keys and keeps other keys", () => {
    storage.setItem("game:petdle:usedGuesses", "[1]");
    storage.setItem("game:other:gaveUp", "1");
    storage.setItem("theme", "dark");
    forgetAllGames(storage);
    assert.deepEqual([...storage.items.keys()], ["theme"]);
  });
});

describe("readProgress", () => {
  it("reads what was played without writing a key", () => {
    state.addUsedGuess(3);
    state.addUsedGuess(4);
    state.setGaveUp();
    const before = new Map(storage.items);
    assert.deepEqual(
      readProgress(storage, () => today, true),
      {
        won: false,
        gaveUp: true,
        guesses: 2,
      },
    );
    assert.deepEqual(storage.items, before);
  });

  it("today's board from another day reads as unplayed, and stays stored", () => {
    state.addUsedGuess(3);
    state.setWon();
    today = TUESDAY;
    assert.deepEqual(
      readProgress(storage, () => today, true),
      {
        won: false,
        gaveUp: false,
        guesses: 0,
      },
    );
    assert.equal(storage.getItem("usedGuesses"), "[3]");
    // A past day's board never expires
    assert.deepEqual(
      readProgress(storage, () => today, false),
      {
        won: true,
        gaveUp: false,
        guesses: 1,
      },
    );
  });

  it("a board never played writes nothing either", () => {
    const empty = new MemoryStorage();
    readProgress(pastDayStorage(empty, "pets", 3), () => today, false);
    assert.equal(empty.length, 0);
  });
});

describe("boardClock", () => {
  let now = 0;
  const day = { current: 3 as number | null };
  const clock = (storage?: StateStorage) =>
    boardClock(
      storage,
      () => day.current,
      () => now,
    );
  beforeEach(() => {
    now = 1_000_000;
    day.current = 3;
  });
  it("counts whole seconds since this browser started it", () => {
    const c = clock(new MemoryStorage());
    c.startClock();
    now += 61_400;
    assert.equal(c.solveSeconds(), 61);
  });
  it("is unknown before it starts, on another day, or without storage", () => {
    const storage = new MemoryStorage();
    assert.equal(clock(storage).solveSeconds(), null);
    clock(storage).startClock();
    day.current = 4;
    assert.equal(clock(storage).solveSeconds(), null);
    clock().startClock();
    assert.equal(clock().solveSeconds(), null);
  });
});
