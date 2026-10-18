// Free Hints (classic games): after FREE_HINT_AFTER wrong guesses a player may reveal one thing
// about the answer, once per day or party round: the value of an attribute they have not
// matched yet, or the answer's description. Pure rules shared by the server and the page.
import { Correctness, type AttributeValue } from "./correctness.ts";
import type { Entry, GameAttribute, GradedAttribute } from "./game.ts";

export const FREE_HINT_AFTER = 3;

export type HintKind = "attribute" | "description";

// What is stored once a hint is used: the kind, and which attribute was drawn (by name)
export type HintPick =
  { kind: "attribute"; attribute: string } | { kind: "description" };

// What the player is shown
export type FreeHint =
  // `image`: an Image attribute, whose value is a picture URL
  | {
      kind: "attribute";
      attribute: string;
      value: AttributeValue;
      image?: true;
    }
  | { kind: "description"; description: string };

// A FreeHint read back from storage or the network; anything else is not one
export function isFreeHint(value: unknown): value is FreeHint {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const hint = value as Record<string, unknown>;
  const text = hint["value"];
  return hint["kind"] === "description"
    ? typeof hint["description"] === "string"
    : hint["kind"] === "attribute" &&
        typeof hint["attribute"] === "string" &&
        (hint["image"] === undefined || hint["image"] === true) &&
        (typeof text === "string" ||
          (Array.isArray(text) && text.every((v) => typeof v === "string")));
}

// Which kinds a player may pick now
export interface HintChoices {
  attribute: boolean;
  description: boolean;
}

export const isHintKind = (value: unknown): value is HintKind =>
  value === "attribute" || value === "description";

// The attributes the answer has a value for and no guessed row matched yet, in game order
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

// The hint kinds on offer for these rows (the player's guesses so far, none of them the
// answer), or null while there are fewer than FREE_HINT_AFTER or nothing could be revealed
export function hintChoices(
  attributes: readonly GameAttribute[],
  answer: Entry,
  rows: readonly GradedAttribute[][],
): HintChoices | null {
  if (rows.length < FREE_HINT_AFTER) {
    return null;
  }
  const choices = {
    attribute: unsolvedAttributes(attributes, answer, rows).length > 0,
    description: (answer.description ?? "") !== "",
  };
  return choices.attribute || choices.description ? choices : null;
}

// Draws the hint a player asked for, or null when that kind is not on offer
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
  if (kind === "description") {
    return { kind };
  }
  const open = unsolvedAttributes(attributes, answer, rows);
  return { kind, attribute: open[Math.floor(random() * open.length)]! };
}

// What a stored pick shows against the answer; null when its attribute is gone
export function revealHint(
  attributes: readonly GameAttribute[],
  answer: Entry,
  pick: HintPick,
): FreeHint | null {
  if (pick.kind === "description") {
    return { kind: "description", description: answer.description ?? "" };
  }
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
