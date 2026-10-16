// Pure game flow: picking the Daily Answer and judging a submitted guess.
import {
  ANSWER_START_DATE,
  generateAnswerSequence,
  getAnswerSeed,
  getDayNumber,
} from "./answer-sequence.ts";
import {
  type AttributeValue,
  type Correctness,
  gradeCorrectness,
} from "./correctness.ts";
import {
  createGameState,
  type GameState,
  type StateStorage,
} from "./game-state.ts";
import { ANSWER_SKIP_PERIOD, type Pet } from "./roster.ts";

// Roster index of today's Daily Answer. Before the start date there is no
// sequence, so it falls back to a random pet.
export function computeAnswerIdx(
  rosterSize: number,
  now: Date,
  makeRandom: (seed: string) => () => number,
  fallbackRandom: () => number = Math.random,
): number {
  const dayNumber: number = getDayNumber(ANSWER_START_DATE, now);
  if (dayNumber < 0) {
    return Math.floor(fallbackRandom() * rosterSize);
  }

  const answerSequence: number[] = generateAnswerSequence(
    rosterSize,
    ANSWER_SKIP_PERIOD,
    dayNumber + 1,
    makeRandom(getAnswerSeed()),
  );
  return answerSequence[answerSequence.length - 1]!;
}

// One Attribute of a guessed pet, graded against the Daily Answer. Rows list
// Attributes in roster key order, which is the table column order.
export interface GradedAttribute {
  key: keyof Pet;
  value: AttributeValue;
  correctness: Correctness;
}

export function gradeGuess(
  roster: readonly Pet[],
  answerIdx: number,
  guess: Pet,
): GradedAttribute[] {
  const answer: Pet = roster[answerIdx]!;
  return (Object.keys(guess) as (keyof Pet)[]).map(
    (key: keyof Pet): GradedAttribute => ({
      key,
      value: guess[key],
      correctness: gradeCorrectness(guess[key], answer[key]),
    }),
  );
}

export type GuessResult =
  | { kind: "invalid" }
  | { kind: "duplicate" }
  | {
      kind: "accepted";
      name: string;
      isAnswer: boolean;
      row: GradedAttribute[];
    };

// Matches the input to a pet (case-insensitive) and records an accepted guess in `state`.
export function submitGuess(
  state: GameState,
  roster: readonly Pet[],
  answerIdx: number,
  input: string,
): GuessResult {
  const guessIdx: number = roster.findIndex(
    (pet: Pet): boolean => pet.name.toLowerCase() === input.toLowerCase(),
  );
  if (guessIdx === -1) {
    return { kind: "invalid" };
  }

  // Use the proper name in case the casing of the input was different
  const guess: Pet = roster[guessIdx]!;
  const name: string = guess.name;
  if (state.getUsedGuesses().includes(name)) {
    return { kind: "duplicate" };
  }

  const isAnswer: boolean = guessIdx === answerIdx;
  if (isAnswer) {
    state.setIsVictory();
  }
  state.addUsedGuess(name);
  return {
    kind: "accepted",
    name,
    isAnswer,
    row: gradeGuess(roster, answerIdx, guess),
  };
}

export interface Game {
  submit(input: string): GuessResult;
  // Graded rows of the guesses already made today, oldest first
  getRows(): GradedAttribute[][];
  getUsedGuesses(): string[];
  getIsVictory(): boolean;
  getAnswerName(): string;
}

export interface GameDeps {
  roster: readonly Pet[];
  storage: StateStorage;
  now: () => Date;
  makeRandom: (seed: string) => () => number;
}

// Today's game: the Daily Answer (computed once) plus the player's Game State.
export function createGame({
  roster,
  storage,
  now,
  makeRandom,
}: GameDeps): Game {
  const state: GameState = createGameState(storage, now);
  let answerIdx: number | null = null;
  const getAnswerIdx = (): number => {
    answerIdx ??= computeAnswerIdx(roster.length, now(), makeRandom);
    return answerIdx;
  };

  return {
    submit: (input: string): GuessResult =>
      submitGuess(state, roster, getAnswerIdx(), input),

    // Names stored by an older roster are skipped
    getRows: (): GradedAttribute[][] =>
      state.getUsedGuesses().flatMap((name: string): GradedAttribute[][] => {
        const pet: Pet | undefined = roster.find(
          (item: Pet): boolean => item.name === name,
        );
        return pet ? [gradeGuess(roster, getAnswerIdx(), pet)] : [];
      }),

    getUsedGuesses: state.getUsedGuesses,
    getIsVictory: state.getIsVictory,
    getAnswerName: (): string => roster[getAnswerIdx()]!.name,
  };
}
