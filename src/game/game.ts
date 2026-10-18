// Pure guess judging, shared by the server (which knows the Daily Answer) and
// the types the client renders.
import {
  type AttributeValue,
  Correctness,
  gradeCorrectness,
  gradeNumber,
  type Hint,
} from "./correctness.ts";
import type { GameKind } from "./blur.ts";

export type AttributeType = "text" | "list" | "number";

export interface GameAttribute {
  name: string;
  type: AttributeType;
}

// What the client knows of an entry: enough to autocomplete and show a photo, and a classic
// game sends its values too for the selection list
export interface EntryRef {
  id: number;
  name: string;
  photo: string;
  values?: AttributeValue[];
}

// An entry with its values, one per game attribute in attribute order (Text and
// Number as a string, List as an array)
export interface Entry extends EntryRef {
  values: AttributeValue[];
  // Blur games only: the order the grid's squares clear in (cells 0-8), once picked
  blurOrder?: number[];
}

// One column of a guessed entry, graded against the Daily Answer. Rows list the
// photo, the name, then the game's Attributes: the table column order. A Blur game's rows
// hold the name only, so no entry's image reaches the player before the day ends.
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

// A Blur game's skip (ADR 0019): the id that stands for "no entry" in a guess list. It uses a
// try like a wrong guess, and any number of them may be made.
export const SKIP = 0;

// The graded row of a skip: one wrong cell keyed "skip", so it never names an entry
export const skippedRow = (): GradedAttribute[] => [
  { key: "skip", value: "Skipped", correctness: Correctness.Incorrect },
];

export const isSkipRow = (row: readonly GradedAttribute[]): boolean =>
  row[0]?.key === "skip";

// A graded row's name cell, wherever the row's kind puts it (a skip's only cell)
export const nameCell = (row: readonly GradedAttribute[]): GradedAttribute =>
  row.find((cell: GradedAttribute): boolean => cell.key === "name") ?? row[0]!;

// The names a player has guessed, which leave the suggestions; skips name nobody
export const guessedNames = (
  rows: readonly (readonly GradedAttribute[])[],
): Set<AttributeValue> =>
  new Set(
    rows.filter((row) => !isSkipRow(row)).map((row) => nameCell(row).value),
  );

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
  if (kind === "blur") {
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

export type GradeIdsResult =
  | { kind: "invalid" }
  | { kind: "duplicate" }
  | { kind: "graded"; rows: GradedAttribute[][]; victory: boolean };

// Grades guesses given by entry id, in order. Any unknown id makes the whole
// batch invalid; otherwise any repeated id makes it a duplicate. A Blur game also takes SKIP,
// as often as it likes.
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
    if (!entry && !(id === SKIP && kind === "blur")) {
      return { kind: "invalid" };
    }
    guesses.push(entry ?? null);
  }
  const entryIds = ids.filter((id) => id !== SKIP);
  if (new Set(entryIds).size !== entryIds.length) {
    return { kind: "duplicate" };
  }

  return {
    kind: "graded",
    rows: guesses.map((guess: Entry | null): GradedAttribute[] =>
      guess ? gradeGuess(attributes, answer, guess, kind) : skippedRow(),
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
