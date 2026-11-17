import {
  type AttributeValue,
  Correctness,
  gradeCorrectness,
  gradeNumber,
  type Hint,
} from "./correctness.ts";
import { isImageGame, type GameKind } from "./blur.ts";
import type { QuizSpec } from "./quiz.ts";

export type AttributeType = "text" | "list" | "number" | "image";

export interface GameAttribute {
  name: string;
  type: AttributeType;
}

export interface EntryRef {
  id: number;
  name: string;
  photo: string;
  values?: AttributeValue[];
}

export interface Entry extends EntryRef {
  values: AttributeValue[];
  blurOrder?: number[];
  quiz?: QuizSpec;
  shots?: string[];
  description?: string;
}

export interface GradedAttribute {
  key: string;
  value: AttributeValue;
  correctness: Correctness;
  hint?: Hint;
  image?: true;
}

export interface BoardColumn {
  title: string;
  image: boolean;
  attribute?: number;
}

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

export const firstImage = (
  attributes: readonly GameAttribute[],
  values: readonly AttributeValue[],
): string =>
  (values.find(
    (value: AttributeValue, i: number): boolean =>
      attributes[i]?.type === "image" && value !== "",
  ) as string | undefined) ?? "";

export const hasAllValues = (
  attributes: readonly GameAttribute[],
  values: readonly AttributeValue[],
): boolean =>
  values.every(
    (value: AttributeValue, i: number): boolean =>
      attributes[i]?.type === "image" || value.length > 0,
  );

export const SKIP = 0;

export const skippedRow = (): GradedAttribute[] => [
  { key: "skip", value: "Skipped", correctness: Correctness.Incorrect },
];

export const isSkipRow = (row: readonly GradedAttribute[]): boolean =>
  row[0]?.key === "skip";

export const nameCell = (row: readonly GradedAttribute[]): GradedAttribute =>
  row.find((cell: GradedAttribute): boolean => cell.key === "name") ?? row[0]!;

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
