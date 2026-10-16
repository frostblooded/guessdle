import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, it } from "node:test";
import seedrandom from "seedrandom";
import { Correctness } from "../src/game/correctness.ts";
import { ANSWER_START_DATE } from "../src/game/answer-sequence.ts";
import {
  computeAnswerIdx,
  createGame,
  findPetId,
  gradeGuess,
  submitGuess,
  type GuessResult,
} from "../src/game/game.ts";
import {
  createGameState,
  type GameState,
  type StateStorage,
} from "../src/game/game-state.ts";
import { GUESS_DATA } from "../src/game/roster.ts";

const golden: { answers: number[] } = JSON.parse(
  readFileSync(
    join(import.meta.dirname, "fixtures", "answer-sequence.golden.json"),
    "utf8",
  ),
);
const makeRandom = (seed: string): (() => number) => seedrandom(seed);
const dayAfterStart = (days: number): Date =>
  new Date(
    ANSWER_START_DATE.getFullYear(),
    ANSWER_START_DATE.getMonth(),
    ANSWER_START_DATE.getDate() + days,
    12,
  );

describe("computeAnswerIdx", () => {
  for (const day of [0, 1, 7, 30]) {
    it(`matches the golden Daily Answer for day ${day}`, () => {
      assert.equal(
        computeAnswerIdx(GUESS_DATA.length, dayAfterStart(day), makeRandom),
        golden.answers[day],
      );
    });
  }

  it("falls back to a random pet before the start date", () => {
    const before: Date = dayAfterStart(-1);
    assert.equal(
      computeAnswerIdx(10, before, makeRandom, () => 0),
      0,
    );
    assert.equal(
      computeAnswerIdx(10, before, makeRandom, () => 0.99),
      9,
    );
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

const summary = (result: GuessResult): unknown =>
  result.kind === "accepted"
    ? { kind: result.kind, id: result.id, isAnswer: result.isAnswer }
    : result;

describe("submitGuess", () => {
  const first: string = GUESS_DATA[0]!.id;
  const second: string = GUESS_DATA[1]!.id;
  let state: GameState;

  beforeEach(() => {
    state = createGameState(new MemoryStorage(), () => new Date(2025, 9, 6));
  });

  it("rejects an id not in the roster without recording anything", () => {
    assert.deepEqual(submitGuess(state, GUESS_DATA, 0, "not-a-pet"), {
      kind: "invalid",
    });
    assert.deepEqual(submitGuess(state, GUESS_DATA, 0, ""), {
      kind: "invalid",
    });
    assert.deepEqual(state.getUsedGuesses(), []);
  });

  it("records a wrong guess without victory", () => {
    assert.deepEqual(summary(submitGuess(state, GUESS_DATA, 1, first)), {
      kind: "accepted",
      id: first,
      isAnswer: false,
    });
    assert.deepEqual(state.getUsedGuesses(), [first]);
    assert.equal(state.getIsVictory(), false);
  });

  it("records the right guess as victory", () => {
    assert.deepEqual(summary(submitGuess(state, GUESS_DATA, 0, first)), {
      kind: "accepted",
      id: first,
      isAnswer: true,
    });
    assert.equal(state.getIsVictory(), true);
  });

  it("does not match a display name or another case", () => {
    for (const input of [GUESS_DATA[0]!.name, first.toUpperCase()]) {
      assert.deepEqual(submitGuess(state, GUESS_DATA, 0, input), {
        kind: "invalid",
      });
    }
    assert.deepEqual(state.getUsedGuesses(), []);
  });

  it("rejects a repeat guess and records it once", () => {
    submitGuess(state, GUESS_DATA, 1, first);
    assert.deepEqual(submitGuess(state, GUESS_DATA, 1, first), {
      kind: "duplicate",
    });
    assert.deepEqual(state.getUsedGuesses(), [first]);
  });

  it("keeps guesses in order", () => {
    submitGuess(state, GUESS_DATA, 5, first);
    submitGuess(state, GUESS_DATA, 5, second);
    assert.deepEqual(state.getUsedGuesses(), [first, second]);
  });
});

describe("gradeGuess", () => {
  it("lists every Attribute except the id in roster key order", () => {
    const row = gradeGuess(GUESS_DATA, 0, GUESS_DATA[1]!);
    assert.deepEqual(
      row.map((cell) => cell.key),
      Object.keys(GUESS_DATA[1]!).filter((key) => key !== "id"),
    );
    assert.deepEqual(
      row.map((cell) => cell.value),
      Object.entries(GUESS_DATA[1]!)
        .filter(([key]) => key !== "id")
        .map(([, value]) => value),
    );
  });

  it("grades every Attribute of the answer itself as correct", () => {
    for (const cell of gradeGuess(GUESS_DATA, 0, GUESS_DATA[0]!)) {
      assert.equal(cell.correctness, Correctness.Correct, cell.key);
    }
  });

  it("grades each Attribute with the shared Correctness rules", () => {
    const roster = [
      {
        id: "a",
        photo: "a",
        name: "A",
        colors: ["Red", "Blue"],
        owners: ["X"],
      },
      {
        id: "b",
        photo: "b",
        name: "B",
        colors: ["Blue", "Green"],
        owners: ["X"],
      },
    ];
    const byKey = Object.fromEntries(
      gradeGuess(roster, 0, roster[1]!).map((c) => [c.key, c.correctness]),
    );
    assert.deepEqual(byKey, {
      photo: Correctness.Incorrect,
      name: Correctness.Incorrect,
      colors: Correctness.PartiallyCorrect,
      owners: Correctness.Correct,
    });
  });
});

describe("createGame", () => {
  const today = new Date(2025, 9, 6, 12);
  const open = (storage = new MemoryStorage()) =>
    createGame({ roster: GUESS_DATA, storage, now: () => today, makeRandom });
  const answer =
    GUESS_DATA[computeAnswerIdx(GUESS_DATA.length, today, makeRandom)]!;

  it("names the Daily Answer", () => {
    assert.equal(open().getAnswerName(), answer.name);
  });

  it("wins when the Daily Answer is guessed", () => {
    const game = open();
    const result = game.submit(answer.id);
    assert.equal(result.kind === "accepted" && result.isAnswer, true);
    assert.equal(game.getIsVictory(), true);
  });

  it("returns graded rows for past guesses after a reopen, oldest first", () => {
    const storage = new MemoryStorage();
    const wrong = GUESS_DATA.filter((pet) => pet.id !== answer.id).slice(0, 2);
    const game = open(storage);
    for (const pet of wrong) {
      game.submit(pet.id);
    }
    const rows = open(storage).getRows();
    assert.deepEqual(
      rows.map((row) => row[1]!.value),
      wrong.map((pet) => pet.name),
    );
    assert.deepEqual(
      game.getUsedGuesses(),
      wrong.map((pet) => pet.id),
    );
  });

  it("skips stored ids that are no longer in the roster", () => {
    const storage = new MemoryStorage();
    storage.setItem("lastPlayed", JSON.stringify("2025-10-6"));
    storage.setItem(
      "usedGuesses",
      JSON.stringify(["gone-pet", GUESS_DATA[0]!.id]),
    );
    assert.equal(open(storage).getRows().length, 1);
    assert.deepEqual(open(storage).getUsedGuesses(), [GUESS_DATA[0]!.id]);
  });

  it("upgrades display names stored before ids, dropping unknown ones", () => {
    const storage = new MemoryStorage();
    storage.setItem("lastPlayed", JSON.stringify("2025-10-6"));
    storage.setItem(
      "usedGuesses",
      JSON.stringify([GUESS_DATA[1]!.name, "Gone Pet", GUESS_DATA[0]!.id]),
    );
    const game = open(storage);
    assert.deepEqual(game.getUsedGuesses(), [
      GUESS_DATA[1]!.id,
      GUESS_DATA[0]!.id,
    ]);
    assert.deepEqual(JSON.parse(storage.getItem("usedGuesses")!), [
      GUESS_DATA[1]!.id,
      GUESS_DATA[0]!.id,
    ]);
  });

  it("finds a pet id from typed text, ignoring case", () => {
    assert.equal(
      findPetId(GUESS_DATA, GUESS_DATA[2]!.name.toUpperCase()),
      GUESS_DATA[2]!.id,
    );
    assert.equal(findPetId(GUESS_DATA, "Nobody"), null);
    assert.equal(findPetId(GUESS_DATA, ""), null);
  });
});
