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
  key: Exclude<keyof Pet, "id">;
  value: AttributeValue;
  correctness: Correctness;
}

export function gradeGuess(
  roster: readonly Pet[],
  answerIdx: number,
  guess: Pet,
): GradedAttribute[] {
  const answer: Pet = roster[answerIdx]!;
  return (Object.keys(guess) as (keyof Pet)[])
    .filter((key: keyof Pet): key is GradedAttribute["key"] => key !== "id")
    .map((key: GradedAttribute["key"]): GradedAttribute => ({
      key,
      value: guess[key],
      correctness: gradeCorrectness(guess[key], answer[key]),
    }));
}

export type GuessResult =
  | { kind: "invalid" }
  | { kind: "duplicate" }
  | {
      kind: "accepted";
      id: string;
      isAnswer: boolean;
      row: GradedAttribute[];
    };

// The id of the pet whose name is the typed text (case-insensitive), or null
export function findPetId(
  roster: readonly Pet[],
  input: string,
): string | null {
  const lower: string = input.toLowerCase();
  return (
    roster.find((pet: Pet): boolean => pet.name.toLowerCase() === lower)?.id ??
    null
  );
}

// Records an accepted guess, given by pet id, in `state`.
export function submitGuess(
  state: GameState,
  roster: readonly Pet[],
  answerIdx: number,
  id: string,
): GuessResult {
  const guessIdx: number = roster.findIndex(
    (pet: Pet): boolean => pet.id === id,
  );
  if (guessIdx === -1) {
    return { kind: "invalid" };
  }

  const guess: Pet = roster[guessIdx]!;
  if (state.getUsedGuesses().includes(id)) {
    return { kind: "duplicate" };
  }

  const isAnswer: boolean = guessIdx === answerIdx;
  if (isAnswer) {
    state.setIsVictory();
  }
  state.addUsedGuess(id);
  return {
    kind: "accepted",
    id,
    isAnswer,
    row: gradeGuess(roster, answerIdx, guess),
  };
}

export interface Game {
  // Takes a pet id
  submit(id: string): GuessResult;
  // Graded rows of the guesses already made today, oldest first
  getRows(): GradedAttribute[][];
  // Pet ids
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
  // Before ids, guesses were stored by display name: upgrade them, drop unknowns
  const stored: string[] = state.getUsedGuesses();
  const upgraded: string[] = stored.flatMap((entry: string): string[] => {
    const pet: Pet | undefined = roster.find(
      (item: Pet): boolean => item.id === entry || item.name === entry,
    );
    return pet ? [pet.id] : [];
  });
  if (upgraded.join() !== stored.join()) {
    state.setUsedGuesses(upgraded);
  }
  let answerIdx: number | null = null;
  const getAnswerIdx = (): number => {
    answerIdx ??= computeAnswerIdx(roster.length, now(), makeRandom);
    return answerIdx;
  };

  return {
    submit: (id: string): GuessResult =>
      submitGuess(state, roster, getAnswerIdx(), id),

    // Ids stored by an older roster are dropped on load
    getRows: (): GradedAttribute[][] =>
      state.getUsedGuesses().flatMap((id: string): GradedAttribute[][] => {
        const pet: Pet | undefined = roster.find(
          (item: Pet): boolean => item.id === id,
        );
        return pet ? [gradeGuess(roster, getAnswerIdx(), pet)] : [];
      }),

    getUsedGuesses: state.getUsedGuesses,
    getIsVictory: state.getIsVictory,
    getAnswerName: (): string => roster[getAnswerIdx()]!.name,
  };
}
