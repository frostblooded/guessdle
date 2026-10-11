import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { loadGame, type GameState, type StateStorage } from "./helpers/load-game.ts";

const game = loadGame();

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
  state = game.createGameState(storage, () => today);
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
    const reloaded = game.createGameState(storage, () => today);
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
    assert.equal(game.createGameState(storage, () => today).getIsVictory(), true);
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
    state.setLastPlayed();
  };

  it("keeps state on the same day", () => {
    play();
    state.resetIfNewDay();
    assert.deepEqual(state.getUsedGuesses(), ["Oreo"]);
    assert.equal(state.getIsVictory(), true);
  });

  it("keeps state later the same day, even just before midnight", () => {
    play();
    today = MONDAY_NIGHT;
    state.resetIfNewDay();
    assert.deepEqual(state.getUsedGuesses(), ["Oreo"]);
  });

  it("clears guesses and victory on the next day", () => {
    play();
    today = TUESDAY;
    state.resetIfNewDay();
    assert.deepEqual(state.getUsedGuesses(), []);
    assert.equal(state.getIsVictory(), false);
  });

  it("clears state when last played is a past month or year", () => {
    play();
    today = new Date(2026, 0, 1);
    state.resetIfNewDay();
    assert.deepEqual(state.getUsedGuesses(), []);
  });

  it("clears state when last played is missing", () => {
    state.addUsedGuess("Oreo");
    state.setIsVictory();
    state.resetIfNewDay();
    assert.deepEqual(state.getUsedGuesses(), []);
    assert.equal(state.getIsVictory(), false);
  });

  it("clears state when last played is corrupt or the wrong type", () => {
    for (const value of ["{bad", "42", "null", '["2025-10-6"]']) {
      state.addUsedGuess("Oreo");
      storage.setItem("lastPlayed", value);
      state.resetIfNewDay();
      assert.deepEqual(state.getUsedGuesses(), [], value);
    }
  });

  it("does nothing on a fresh storage", () => {
    state.resetIfNewDay();
    assert.deepEqual(state.getUsedGuesses(), []);
    assert.equal(state.getIsVictory(), false);
  });

  it("setLastPlayed marks today so a later reset on that day keeps state", () => {
    today = TUESDAY;
    state.setLastPlayed();
    state.addUsedGuess("Milo");
    state.resetIfNewDay();
    assert.deepEqual(state.getUsedGuesses(), ["Milo"]);
  });
});
