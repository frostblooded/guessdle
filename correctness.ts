// Pure grading of a guessed attribute.

export type AttributeValue = string | string[];

export const Correctness = {
  Incorrect: 0,
  PartiallyCorrect: 1,
  Correct: 2,
} as const;
export type Correctness = (typeof Correctness)[keyof typeof Correctness];

const CORRECTNESS_CLASSES: Record<Correctness, string> = {
  [Correctness.Incorrect]: "incorrect",
  [Correctness.PartiallyCorrect]: "partially-correct",
  [Correctness.Correct]: "correct",
};

export function correctnessClass(correctness: Correctness): string {
  return CORRECTNESS_CLASSES[correctness];
}

export function gradeCorrectness(
  guess: AttributeValue,
  answer: AttributeValue,
): Correctness {
  if (typeof guess === "string")
    return guess === answer ? Correctness.Correct : Correctness.Incorrect;

  if (arraysAreSame(guess, answer as string[]))
    return Correctness.Correct;
  if (arraysHaveCommonElement(guess, answer as string[]))
    return Correctness.PartiallyCorrect;
  return Correctness.Incorrect;
}

function arraysHaveCommonElement(array1: string[], array2: string[]): boolean {
  for (let el1 of array1) {
    for (let el2 of array2) {
      if (el1 === el2) {
        return true;
      }
    }
  }

  return false;
}

function arraysAreSame(array1: string[], array2: string[]): boolean {
  // Assumes neither array contains duplicate values (true for the roster).
  // With duplicates, the result is not meaningful: ["a", "a", "b"] and
  // ["a", "b", "b"] would compare as the same.
  if (array1.length !== array2.length)
    return false;

  return array1.every((el) => array2.includes(el));
}
