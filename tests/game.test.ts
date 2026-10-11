import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, it } from "node:test";
import seedrandom from "seedrandom";
import { ANSWER_START_DATE } from "../answer-sequence.ts";
import { computeAnswerIdx, submitGuess } from "../game.ts";
import { createGameState, type GameState, type StateStorage } from "../game-state.ts";
import { GUESS_DATA } from "../roster.ts";

const golden: { answers: number[] } = JSON.parse(
  readFileSync(join(import.meta.dirname, "fixtures", "answer-sequence.golden.json"), "utf8"),
);
const makeRandom = (seed: string): (() => number) => seedrandom(seed);
const dayAfterStart = (days: number): Date =>
  new Date(ANSWER_START_DATE.getFullYear(), ANSWER_START_DATE.getMonth(), ANSWER_START_DATE.getDate() + days, 12);

describe("computeAnswerIdx", () => {
  for (const day of [0, 1, 7, 30]) {
    it(`matches the golden Daily Answer for day ${day}`, () => {
      assert.equal(computeAnswerIdx(GUESS_DATA.length, dayAfterStart(day), makeRandom), golden.answers[day]);
    });
  }

  it("falls back to a random pet before the start date", () => {
    const before: Date = dayAfterStart(-1);
    assert.equal(computeAnswerIdx(10, before, makeRandom, () => 0), 0);
    assert.equal(computeAnswerIdx(10, before, makeRandom, () => 0.99), 9);
  });
});

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

describe("submitGuess", () => {
  const first: string = GUESS_DATA[0]!.name;
  const second: string = GUESS_DATA[1]!.name;
  let state: GameState;

  beforeEach(() => {
    state = createGameState(new MemoryStorage(), () => new Date(2025, 9, 6));
  });

  it("rejects a name not in the roster without recording anything", () => {
    assert.deepEqual(submitGuess(state, GUESS_DATA, 0, "Not A Pet"), { kind: "invalid" });
    assert.deepEqual(submitGuess(state, GUESS_DATA, 0, ""), { kind: "invalid" });
    assert.deepEqual(state.getUsedGuesses(), []);
  });

  it("records a wrong guess without victory", () => {
    assert.deepEqual(submitGuess(state, GUESS_DATA, 1, first), { kind: "accepted", name: first, isAnswer: false });
    assert.deepEqual(state.getUsedGuesses(), [first]);
    assert.equal(state.getIsVictory(), false);
  });

  it("records the right guess as victory", () => {
    assert.deepEqual(submitGuess(state, GUESS_DATA, 0, first), { kind: "accepted", name: first, isAnswer: true });
    assert.equal(state.getIsVictory(), true);
  });

  it("matches case-insensitively and records the proper name", () => {
    assert.deepEqual(submitGuess(state, GUESS_DATA, 0, first.toUpperCase()), {
      kind: "accepted",
      name: first,
      isAnswer: true,
    });
    assert.deepEqual(state.getUsedGuesses(), [first]);
  });

  it("rejects a repeat guess, even in another case, and records it once", () => {
    submitGuess(state, GUESS_DATA, 1, first);
    assert.deepEqual(submitGuess(state, GUESS_DATA, 1, first.toLowerCase()), { kind: "duplicate" });
    assert.deepEqual(state.getUsedGuesses(), [first]);
  });

  it("keeps guesses in order", () => {
    submitGuess(state, GUESS_DATA, 5, first);
    submitGuess(state, GUESS_DATA, 5, second);
    assert.deepEqual(state.getUsedGuesses(), [first, second]);
  });
});
