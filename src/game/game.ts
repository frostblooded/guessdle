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

export type AttributeType = "text" | "list" | "number" | "image";

export interface GameAttribute {
  name: string;
  type: AttributeType;
}

// What the client knows of an entry: enough to autocomplete and show a photo. A classic
// entry's photo is its first Image value (blank when it has none); a Blur entry's is its image.
// A classic entry carries its values too, for the selection list.
export interface EntryRef {
  id: number;
  name: string;
  photo: string;
  values?: AttributeValue[];
}

// An entry with its values, one per game attribute in attribute order (Text, Number and
// Image as a string, List as an array; Image holds the upload URL)
export interface Entry extends EntryRef {
  values: AttributeValue[];
  // Blur games only: the order the grid's squares clear in (cells 0-8), once picked
  blurOrder?: number[];
  // Sequence games only: the photos in the order players see them, "" for a missing one
  shots?: string[];
}

// One column of a guessed entry, graded against the Daily Answer, in boardColumns order. A
// Blur or Sequence game's rows hold the name only, so no entry's image reaches the player
// before the day ends.
export interface GradedAttribute {
  key: string;
  value: AttributeValue;
  // An Image column is never colored: correct only on the answer itself, so a winning row
  // stays all correct
  correctness: Correctness;
  // Number columns only, on a wrong guess
  hint?: Hint;
  // Image columns only: the value is a picture's URL, shown as is
  image?: true;
}

// A board column: its title, whether it shows a picture, and which attribute it holds
// (undefined for Name)
export interface BoardColumn {
  title: string;
  image: boolean;
  attribute?: number;
}

// The guess grid's columns: Name, then a classic game's Attributes in their order. A Blur or
// Sequence game shows the name only.
export function boardColumns(
  attributes: readonly GameAttribute[],
  kind: GameKind = "classic",
): BoardColumn[] {
  const name: BoardColumn = { title: "Name", image: false };
  if (isImageGame(kind)) {
    return [name];
  }
  return [
    name,
    ...attributes.map((attribute: GameAttribute, i: number): BoardColumn => ({
      title: attribute.name,
      image: attribute.type === "image",
      attribute: i,
    })),
  ];
}

// An entry's first Image value, its photo wherever one picture stands for it (blank: none)
export const firstImage = (
  attributes: readonly GameAttribute[],
  values: readonly AttributeValue[],
): string =>
  (values.find(
    (value: AttributeValue, i: number): boolean =>
      attributes[i]?.type === "image" && value !== "",
  ) as string | undefined) ?? "";

// Every attribute but Image (which may stay blank) has a value: an entry missing one pauses
// its game
export const hasAllValues = (
  attributes: readonly GameAttribute[],
  values: readonly AttributeValue[],
): boolean =>
  values.every(
    (value: AttributeValue, i: number): boolean =>
      attributes[i]?.type === "image" || value.length > 0,
  );

// A Blur or Sequence game's skip (ADR 0019, 0020): the id that stands for "no entry" in a guess list. It uses a
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
  if (isImageGame(kind)) {
    return [
      {
        ...name,
        correctness:
          guess.id === answer.id ? Correctness.Correct : Correctness.Incorrect,
      },
    ];
  }
  return boardColumns(attributes).map(
    (column: BoardColumn): GradedAttribute => {
      const i = column.attribute;
      if (i === undefined) {
        return name;
      }
      const [value, target] = [guess.values[i]!, answer.values[i]!];
      const attribute = attributes[i]!;
      if (attribute.type === "image") {
        return {
          key: attribute.name,
          value,
          correctness:
            guess.id === answer.id
              ? Correctness.Correct
              : Correctness.Incorrect,
          image: true,
        };
      }
      return {
        key: attribute.name,
        value,
        ...(attribute.type === "number"
          ? gradeNumber(value as string, target as string)
          : { correctness: gradeCorrectness(value, target) }),
      };
    },
  );
}

export type GradeIdsResult =
  | { kind: "invalid" }
  | { kind: "duplicate" }
  | { kind: "graded"; rows: GradedAttribute[][]; victory: boolean };

// Grades guesses given by entry id, in order. Any unknown id makes the whole
// batch invalid; otherwise any repeated id makes it a duplicate. A Blur or Sequence game also
// takes SKIP, as often as it likes.
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
