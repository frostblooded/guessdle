// Pure guess judging, shared by the server (which knows the Daily Answer) and
// the types the client renders.
import {
  type AttributeValue,
  Correctness,
  gradeCorrectness,
  gradeNumber,
  type Hint,
} from "./correctness.ts";

export type AttributeType = "text" | "list" | "number";

export interface GameAttribute {
  name: string;
  type: AttributeType;
}

// What the client knows of an entry: enough to autocomplete and show a photo
export interface EntryRef {
  id: number;
  name: string;
  photo: string;
}

// An entry with its values, one per game attribute in attribute order (Text and
// Number as a string, List as an array)
export interface Entry extends EntryRef {
  values: AttributeValue[];
}

// One column of a guessed entry, graded against the Daily Answer. Rows list the
// photo, the name, then the game's Attributes: the table column order.
export interface GradedAttribute {
  key: string;
  value: AttributeValue;
  correctness: Correctness;
  // Number columns only, on a wrong guess
  hint?: Hint;
}

// Every attribute has a value: an entry missing one pauses its game
export const hasAllValues = (values: readonly AttributeValue[]): boolean =>
  values.every((value: AttributeValue): boolean => value.length > 0);

export function isAnswerRow(row: GradedAttribute[]): boolean {
  return row.every(
    (cell: GradedAttribute): boolean =>
      cell.correctness === Correctness.Correct,
  );
}

export function gradeGuess(
  attributes: readonly GameAttribute[],
  answer: Entry,
  guess: Entry,
): GradedAttribute[] {
  return [
    {
      key: "photo",
      value: guess.photo,
      correctness:
        guess.id === answer.id ? Correctness.Correct : Correctness.Incorrect,
    },
    {
      key: "name",
      value: guess.name,
      correctness: gradeCorrectness(guess.name, answer.name),
    },
    ...attributes.map(
      (attribute: GameAttribute, i: number): GradedAttribute => ({
        key: attribute.name,
        value: guess.values[i]!,
        ...(attribute.type === "number"
          ? gradeNumber(guess.values[i] as string, answer.values[i] as string)
          : {
              correctness: gradeCorrectness(
                guess.values[i]!,
                answer.values[i]!,
              ),
            }),
      }),
    ),
  ];
}

export type GradeIdsResult =
  | { kind: "invalid" }
  | { kind: "duplicate" }
  | { kind: "graded"; rows: GradedAttribute[][]; victory: boolean };

// Grades guesses given by entry id, in order. Any unknown id makes the whole
// batch invalid; otherwise any repeated id makes it a duplicate.
export function gradeIds(
  attributes: readonly GameAttribute[],
  roster: readonly Entry[],
  answer: Entry,
  ids: readonly number[],
): GradeIdsResult {
  const guesses: Entry[] = [];
  for (const id of ids) {
    const entry: Entry | undefined = roster.find(
      (item: Entry): boolean => item.id === id,
    );
    if (!entry) {
      return { kind: "invalid" };
    }
    guesses.push(entry);
  }
  if (new Set(ids).size !== ids.length) {
    return { kind: "duplicate" };
  }

  return {
    kind: "graded",
    rows: guesses.map((guess: Entry): GradedAttribute[] =>
      gradeGuess(attributes, answer, guess),
    ),
    victory: ids.includes(answer.id),
  };
}

// The id of the entry whose name is the typed text (case-insensitive), or null
export function findEntryId(
  roster: readonly EntryRef[],
  input: string,
): number | null {
  const lower: string = input.toLowerCase();
  return (
    roster.find(
      (entry: EntryRef): boolean => entry.name.toLowerCase() === lower,
    )?.id ?? null
  );
}
