// Pure guess judging, shared by the server (which knows the Daily Answer) and
// the types the client renders.
import {
  type AttributeValue,
  Correctness,
  gradeCorrectness,
  gradeNumber,
  type Hint,
} from "./correctness.ts";
import { isImageGame, type GameKind } from "./blur.ts";

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
  // Blur games only: the order the grid's squares clear in (cells 0-8), once picked
  blurOrder?: number[];
  // Sequence games only: the photos in the order players see them, "" for a missing one
  shots?: string[];
}

// One column of a guessed entry, graded against the Daily Answer. Rows list the
// photo, the name, then the game's Attributes: the table column order. A Blur or Sequence
// game's rows hold the name only, so no entry's image reaches the player before the day ends.
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

// A graded row's name cell, wherever the row's kind puts it
export const nameCell = (row: readonly GradedAttribute[]): GradedAttribute =>
  row.find((cell: GradedAttribute): boolean => cell.key === "name")!;

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
  kind: GameKind = "classic",
): GradedAttribute[] {
  const name: GradedAttribute = {
    key: "name",
    value: guess.name,
    correctness: gradeCorrectness(guess.name, answer.name),
  };
  if (isImageGame(kind)) {
    return [
      {
        ...name,
        correctness:
          guess.id === answer.id ? Correctness.Correct : Correctness.Incorrect,
      },
    ];
  }
  return [
    {
      key: "photo",
      value: guess.photo,
      correctness:
        guess.id === answer.id ? Correctness.Correct : Correctness.Incorrect,
    },
    name,
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

// A skip in a Blur or Sequence game: in a list of guessed ids it uses up a try like a wrong
// guess, and may repeat
export const SKIP = 0;

// The row a skip shows in the guess list
const skipRow = (): GradedAttribute[] => [
  { key: "name", value: "Skipped", correctness: Correctness.Incorrect },
];

export type GradeIdsResult =
  | { kind: "invalid" }
  | { kind: "duplicate" }
  | { kind: "graded"; rows: GradedAttribute[][]; victory: boolean };

// Grades guesses given by entry id, in order. Any unknown id (or a SKIP outside a Blur or
// Sequence game) makes the whole batch invalid; otherwise any repeated id makes it a duplicate.
export function gradeIds(
  attributes: readonly GameAttribute[],
  roster: readonly Entry[],
  answer: Entry,
  ids: readonly number[],
  kind: GameKind = "classic",
): GradeIdsResult {
  const guesses: (Entry | null)[] = [];
  for (const id of ids) {
    const entry: Entry | undefined = roster.find(
      (item: Entry): boolean => item.id === id,
    );
    if (!entry && !(id === SKIP && isImageGame(kind))) {
      return { kind: "invalid" };
    }
    guesses.push(entry ?? null);
  }
  const named: readonly number[] = ids.filter((id) => id !== SKIP);
  if (new Set(named).size !== named.length) {
    return { kind: "duplicate" };
  }

  return {
    kind: "graded",
    rows: guesses.map((guess: Entry | null): GradedAttribute[] =>
      guess ? gradeGuess(attributes, answer, guess, kind) : skipRow(),
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
