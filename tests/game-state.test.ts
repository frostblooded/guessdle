import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import {
  createGameState,
  type GameState,
  type StateStorage,
} from "../game-state.ts";

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
    state.addUsedGuess("Oreo");
    state.addUsedGuess("Milo");
    assert.deepEqual(state.getUsedGuesses(), ["Oreo", "Milo"]);
  });

  it("survives a new instance over the same storage", () => {
    state.addUsedGuess("Oreo");
    const reloaded = createGameState(storage, () => today);
    assert.deepEqual(reloaded.getUsedGuesses(), ["Oreo"]);
  });

  it("reads corrupt JSON as empty and recovers on the next add", () => {
    storage.setItem("usedGuesses", "{not json");
    assert.deepEqual(state.getUsedGuesses(), []);
    state.addUsedGuess("Oreo");
    assert.deepEqual(state.getUsedGuesses(), ["Oreo"]);
  });

  it("reads a non-array value as empty", () => {
    storage.setItem("usedGuesses", JSON.stringify({ a: 1 }));
    assert.deepEqual(state.getUsedGuesses(), []);
  });

  it("drops non-string entries", () => {
    storage.setItem("usedGuesses", JSON.stringify(["Oreo", 7, null, "Milo"]));
    assert.deepEqual(state.getUsedGuesses(), ["Oreo", "Milo"]);
  });
});

describe("victory", () => {
  it("starts false", () => {
    assert.equal(state.getIsVictory(), false);
  });

  it("is true after setIsVictory and survives a new instance", () => {
    state.setIsVictory();
    assert.equal(state.getIsVictory(), true);
    assert.equal(createGameState(storage, () => today).getIsVictory(), true);
  });

  it("reads corrupt JSON as false", () => {
    storage.setItem("victory", "tru");
    assert.equal(state.getIsVictory(), false);
  });

  it("reads any stored value other than true as false", () => {
    for (const value of ["false", "1", '"true"', "null"]) {
      storage.setItem("victory", value);
      assert.equal(state.getIsVictory(), false, value);
    }
  });
});

describe("last played and the new-day reset", () => {
  const play = (): void => {
    state.addUsedGuess("Oreo");
    state.setIsVictory();
  };
  const open = (): GameState => createGameState(storage, () => today);

  it("keeps state when reopened on the same day", () => {
    play();
    const reopened = open();
    assert.deepEqual(reopened.getUsedGuesses(), ["Oreo"]);
    assert.equal(reopened.getIsVictory(), true);
  });

  it("keeps state when reopened later the same day, even just before midnight", () => {
    play();
    today = MONDAY_NIGHT;
    assert.deepEqual(open().getUsedGuesses(), ["Oreo"]);
  });

  it("clears guesses and victory on the next day", () => {
    play();
    today = TUESDAY;
    const reopened = open();
    assert.deepEqual(reopened.getUsedGuesses(), []);
    assert.equal(reopened.getIsVictory(), false);
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
    assert.equal(reopened.getIsVictory(), false);
  });

  it("clears state when last played is corrupt or the wrong type", () => {
    for (const value of ["{bad", "42", "null", '["2025-10-6"]']) {
      play();
      storage.setItem("lastPlayed", value);
      assert.deepEqual(open().getUsedGuesses(), [], value);
    }
  });

  it("starts empty on a fresh storage", () => {
    assert.deepEqual(state.getUsedGuesses(), []);
    assert.equal(state.getIsVictory(), false);
  });

  it("marks today as played so a later open the same day keeps state", () => {
    today = TUESDAY;
    const tuesday = open();
    tuesday.addUsedGuess("Milo");
    assert.deepEqual(open().getUsedGuesses(), ["Milo"]);
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
    assert.equal(blockedState.getIsVictory(), false);
  });

  it("keeps guesses and victory for this page view", () => {
    const blockedState = createGameState(blocked, () => today);
    blockedState.addUsedGuess("Oreo");
    blockedState.addUsedGuess("Milo");
    blockedState.setIsVictory();
    assert.deepEqual(blockedState.getUsedGuesses(), ["Oreo", "Milo"]);
    assert.equal(blockedState.getIsVictory(), true);
  });
});

describe("storage keys", () => {
  it("writes the keys returning players already have stored", () => {
    state.addUsedGuess("Oreo");
    state.setIsVictory();
    assert.deepEqual(Object.fromEntries(storage.items), {
      usedGuesses: '["Oreo"]',
      victory: "true",
      lastPlayed: '"2025-10-6"',
    });
  });
});
