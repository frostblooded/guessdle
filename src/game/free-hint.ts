import { Correctness, type AttributeValue } from "./correctness.ts";
import type { Entry, GameAttribute, GradedAttribute } from "./game.ts";

export const FREE_HINT_AFTER = 3;

export type HintKind = "attribute";

export interface HintPick {
  kind: "attribute";
  attribute: string;
}

export interface FreeHint {
  kind: "attribute";
  attribute: string;
  value: AttributeValue;
  image?: true;
}

export function isFreeHint(value: unknown): value is FreeHint {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const hint = value as Record<string, unknown>;
  const text = hint["value"];
  return (
    hint["kind"] === "attribute" &&
    typeof hint["attribute"] === "string" &&
    (hint["image"] === undefined || hint["image"] === true) &&
    (typeof text === "string" ||
      (Array.isArray(text) && text.every((v) => typeof v === "string")))
  );
}

export interface HintChoices {
  attribute: boolean;
}

export const isHintKind = (value: unknown): value is HintKind =>
  value === "attribute";

export function unsolvedAttributes(
  attributes: readonly GameAttribute[],
  answer: Entry,
  rows: readonly GradedAttribute[][],
): string[] {
  return attributes
    .filter(
      (attribute, i) =>
        answer.values[i]!.length > 0 &&
        !rows.some((row) =>
          row.some(
            (cell) =>
              cell.key === attribute.name &&
              cell.correctness === Correctness.Correct,
          ),
        ),
    )
    .map((attribute) => attribute.name);
}

export function hintChoices(
  attributes: readonly GameAttribute[],
  answer: Entry,
  rows: readonly GradedAttribute[][],
): HintChoices | null {
  if (rows.length < FREE_HINT_AFTER) {
    return null;
  }
  return unsolvedAttributes(attributes, answer, rows).length > 0
    ? { attribute: true }
    : null;
}

export function pickHint(
  attributes: readonly GameAttribute[],
  answer: Entry,
  rows: readonly GradedAttribute[][],
  kind: HintKind,
  random: () => number,
): HintPick | null {
  if (!hintChoices(attributes, answer, rows)?.[kind]) {
    return null;
  }
  const open = unsolvedAttributes(attributes, answer, rows);
  return { kind, attribute: open[Math.floor(random() * open.length)]! };
}

export function revealHint(
  attributes: readonly GameAttribute[],
  answer: Entry,
  pick: HintPick,
): FreeHint | null {
  const i = attributes.findIndex((a) => a.name === pick.attribute);
  return i < 0
    ? null
    : {
        kind: "attribute",
        attribute: pick.attribute,
        value: answer.values[i]!,
        ...(attributes[i]!.type === "image" && { image: true as const }),
      };
}
