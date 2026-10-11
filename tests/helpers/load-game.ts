import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";

const ROOT: string = join(import.meta.dirname, "..", "..");

// Load order mirrors the <script> tags in index.html, minus the DOM scripts.
const SCRIPT_PATHS: string[] = [
  "libs/seedrandom/seedrandom.js",
  "roster.js",
  "answer-sequence.js",
  "correctness.js",
];

export type AttributeValue = string | string[];

// Mirrors the Correctness enum in correctness.ts
export const Correctness = {
  Incorrect: 0,
  PartiallyCorrect: 1,
  Correct: 2,
} as const;
export type CorrectnessValue = (typeof Correctness)[keyof typeof Correctness];

export interface Game {
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

  return {
    rosterSize: evaluate<number>("GUESS_DATA.length"),
    skipPeriod: evaluate<number>("ANSWER_SKIP_PERIOD"),
    startDate: new Date(evaluate<Date>("ANSWER_START_DATE").getTime()),
    answerSeed: evaluate<string>("getAnswerSeed()"),
    seededRandom: makeRandom,
    getDayNumber: evaluate<Game["getDayNumber"]>("getDayNumber"),
    // Copy inputs: the grader sorts arrays in place (#20)
    gradeCorrectness: (guess, answer): CorrectnessValue =>
      grade(copyValue(guess), copyValue(answer)),
    correctnessClass: evaluate<Game["correctnessClass"]>("correctnessClass"),
    // Copy out of the vm realm so deepStrictEqual sees a plain Array
    generateAnswerSequence: (...args): number[] => Array.from(generate(...args)),
  };
}
