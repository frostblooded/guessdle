import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";

const ROOT: string = join(import.meta.dirname, "..", "..");

// Load order mirrors the <script> tags in index.html, minus the DOM scripts.
const SCRIPT_PATHS: string[] = [
  "libs/seedrandom/seedrandom.js",
  "roster.js",
  "answer-sequence.js",
  "game-state.js",
  "correctness.js",
];

export type AttributeValue = string | string[];

export interface CorrectnessEnum {
  Incorrect: number;
  PartiallyCorrect: number;
  Correct: number;
}
export type CorrectnessValue = number;

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
  resetIfNewDay(): void;
  setLastPlayed(): void;
}

export interface Game {
  createGameState(storage: StateStorage, now: () => Date): GameState;
  Correctness: CorrectnessEnum;
  gradeCorrectness(guess: AttributeValue, answer: AttributeValue): CorrectnessValue;
  correctnessClass(correctness: CorrectnessValue): string;
  rosterSize: number;
  skipPeriod: number;
  startDate: Date;
  answerSeed: string;
  seededRandom(seed: string): () => number;
  getDayNumber(start: Date, today: Date): number;
  generateAnswerSequence(
    rosterSize: number,
    skipPeriod: number,
    days: number,
    random: () => number,
  ): number[];
}

const copyValue = (value: AttributeValue): AttributeValue =>
  typeof value === "string" ? value : [...value];

// Runs the compiled global scripts in an isolated context. Needs `npx tsc` first.
export function loadGame(): Game {
  const context: vm.Context = vm.createContext({});
  for (const path of SCRIPT_PATHS) {
    vm.runInContext(readFileSync(join(ROOT, path), "utf8"), context, {
      filename: path,
    });
  }

  const evaluate = <T>(code: string): T => vm.runInContext(code, context) as T;
  const generate: Game["generateAnswerSequence"] = evaluate(
    "generateAnswerSequence",
  );
  const makeRandom: (seed: string) => () => number = evaluate(
    "(seed) => new Math.seedrandom(seed)",
  );

  const grade: Game["gradeCorrectness"] = evaluate("gradeCorrectness");

  const makeState: (storage: StateStorage, now: () => Date) => GameState =
    evaluate("createGameState");

  return {
    // Copy arrays out of the vm realm so deepStrictEqual sees a plain Array
    createGameState: (storage, now): GameState => {
      const state: GameState = makeState(storage, now);
      return {
        ...state,
        getUsedGuesses: (): string[] => Array.from(state.getUsedGuesses()),
      };
    },
    rosterSize: evaluate<number>("GUESS_DATA.length"),
    skipPeriod: evaluate<number>("ANSWER_SKIP_PERIOD"),
    startDate: new Date(evaluate<Date>("ANSWER_START_DATE").getTime()),
    answerSeed: evaluate<string>("getAnswerSeed()"),
    seededRandom: makeRandom,
    getDayNumber: evaluate<Game["getDayNumber"]>("getDayNumber"),
    // Copy inputs: the grader sorts arrays in place (#20)
    Correctness: { ...evaluate<CorrectnessEnum>("Correctness") },
    gradeCorrectness: (guess, answer): CorrectnessValue =>
      grade(copyValue(guess), copyValue(answer)),
    correctnessClass: evaluate<Game["correctnessClass"]>("correctnessClass"),
    // Copy out of the vm realm so deepStrictEqual sees a plain Array
    generateAnswerSequence: (...args): number[] => Array.from(generate(...args)),
  };
}
