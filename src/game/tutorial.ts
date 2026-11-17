import { Correctness, type AttributeValue } from "./correctness.ts";
import {
  boardColumns,
  gradeGuess,
  type Entry,
  type GameAttribute,
  type GradedAttribute,
} from "./game.ts";

export interface Tutorial {
  attributes: GameAttribute[];
  entries: Entry[];
  answerId: number;
}

const list = (value: AttributeValue): string =>
  Array.isArray(value) ? value.join(", ") : value;

export function explainRow(
  attributes: readonly GameAttribute[],
  row: readonly GradedAttribute[],
): string[] {
  return boardColumns(attributes)
    .map((column, i) => ({ column, cell: row[i]! }))
    .filter(({ cell }) => !cell.image)
    .map(({ column, cell: { key, value, correctness, hint } }): string => {
      if (column.attribute === undefined) {
        return correctness === Correctness.Correct
          ? `Name is green: ${list(value)} is the secret pet!`
          : `Name is red: ${list(value)} is not the secret pet.`;
      }
      const type = attributes[column.attribute]!.type;
      const shown = list(value);
      if (correctness === Correctness.Correct) {
        return type === "list"
          ? `${key} is green: the secret pet has exactly ${shown}.`
          : `${key} is green: the secret pet's ${key.toLowerCase()} is ${shown}.`;
      }
      if (correctness === Correctness.PartiallyCorrect) {
        return `${key} is orange: the secret pet has some of ${shown}, but not exactly these.`;
      }
      if (type === "number" && hint) {
        return `${key} is red with ${hint === "higher" ? "↑" : "↓"}: the secret pet's ${key.toLowerCase()} is ${hint} than ${shown}.`;
      }
      return type === "list"
        ? `${key} is red: the secret pet has none of ${shown}.`
        : `${key} is red: the secret pet's ${key.toLowerCase()} is not ${shown}.`;
    });
}

const sameCell = (a: GradedAttribute, b: GradedAttribute): boolean =>
  a.correctness === b.correctness && a.hint === b.hint;

export function stillFitting(
  attributes: readonly GameAttribute[],
  entries: readonly Entry[],
  guesses: readonly Entry[],
  rows: readonly GradedAttribute[][],
): Entry[] {
  return entries.filter((candidate) =>
    guesses.every((guess, g) =>
      gradeGuess(attributes, candidate, guess).every((cell, c) =>
        sameCell(cell, rows[g]![c]!),
      ),
    ),
  );
}
