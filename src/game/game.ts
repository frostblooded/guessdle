// Pure guess judging, shared by the server (which knows the Daily Answer) and
// the types the client renders.
import {
  type AttributeValue,
  type Correctness,
  gradeCorrectness,
} from "./correctness.ts";
import type { Pet } from "./roster.ts";

// One Attribute of a guessed pet, graded against the Daily Answer. Rows list
// Attributes in roster key order, which is the table column order.
export interface GradedAttribute {
  key: Exclude<keyof Pet, "id">;
  value: AttributeValue;
  correctness: Correctness;
}

export function gradeGuess(answer: Pet, guess: Pet): GradedAttribute[] {
  return (Object.keys(guess) as (keyof Pet)[])
    .filter((key: keyof Pet): key is GradedAttribute["key"] => key !== "id")
    .map((key: GradedAttribute["key"]): GradedAttribute => ({
      key,
      value: guess[key],
      correctness: gradeCorrectness(guess[key], answer[key]),
    }));
}

export type GradeIdsResult =
  | { kind: "invalid" }
  | { kind: "duplicate" }
  | { kind: "graded"; rows: GradedAttribute[][]; victory: boolean };

// Grades guesses given by pet id, in order. Any unknown id makes the whole
// batch invalid; otherwise any repeated id makes it a duplicate.
export function gradeIds(
  roster: readonly Pet[],
  answer: Pet,
  ids: readonly string[],
): GradeIdsResult {
  const guesses: Pet[] = [];
  for (const id of ids) {
    const pet: Pet | undefined = roster.find(
      (item: Pet): boolean => item.id === id,
    );
    if (!pet) {
      return { kind: "invalid" };
    }
    guesses.push(pet);
  }
  if (new Set(ids).size !== ids.length) {
    return { kind: "duplicate" };
  }

  return {
    kind: "graded",
    rows: guesses.map((guess: Pet): GradedAttribute[] =>
      gradeGuess(answer, guess),
    ),
    victory: ids.includes(answer.id),
  };
}

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
