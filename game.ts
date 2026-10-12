// Pure game flow: picking the Daily Answer and judging a submitted guess.
import {
  ANSWER_START_DATE,
  generateAnswerSequence,
  getAnswerSeed,
  getDayNumber,
} from "./answer-sequence.ts";
import type { GameState } from "./game-state.ts";
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
  if (dayNumber < 0) return Math.floor(fallbackRandom() * rosterSize);

  const answerSequence: number[] = generateAnswerSequence(
    rosterSize,
    ANSWER_SKIP_PERIOD,
    dayNumber + 1,
    makeRandom(getAnswerSeed()),
  );
  return answerSequence[answerSequence.length - 1]!;
}

export type GuessResult =
  | { kind: "invalid" }
  | { kind: "duplicate" }
  | { kind: "accepted"; name: string; isAnswer: boolean };

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
  if (guessIdx === -1) return { kind: "invalid" };

  // Use the proper name in case the casing of the input was different
  const name: string = roster[guessIdx]!.name;
  if (state.getUsedGuesses().includes(name)) return { kind: "duplicate" };

  const isAnswer: boolean = guessIdx === answerIdx;
  if (isAnswer) state.setIsVictory();
  state.addUsedGuess(name);
  return { kind: "accepted", name, isAnswer };
}
