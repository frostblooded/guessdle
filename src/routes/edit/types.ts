// What the editor's API calls answer with.
import type { QuizSpec } from "../../game/quiz.ts";
import type { GameKind } from "../../game/blur.ts";
import { isComplete } from "../../game/kinds.ts";

export interface Attribute {
  id: number;
  name: string;
  type: "text" | "list" | "number" | "image";
}

export interface Entry {
  id: number;
  name: string;
  photo: string;
  // Optional, shown once the entry is revealed as the answer
  description: string;
  values: Record<string, string[]>;
  // Blur games only: the order the squares clear in, null until picked
  blurOrder?: number[] | null;
  // Quiz games only: the question's answer
  quiz?: QuizSpec | null;
  // Sequence games only: the photos in order, "" for an empty slot
  shots?: string[];
}

export const IMAGE_TYPES = "image/jpeg,image/png,image/webp";

// An entry missing what its game needs (KINDS): values, a Blur image and order, a Quiz answer,
// or (guess-only, not pausing) a Sequence game's `tries` photos
export const isIncomplete = (
  entry: Entry,
  kind: GameKind,
  tries: number,
  attributes: readonly Attribute[],
): boolean =>
  !isComplete(kind, entry, {
    valuesFilled: attributes.every(
      (attr) =>
        attr.type === "image" || Boolean(entry.values[String(attr.id)]?.length),
    ),
    tries,
  });

// The entry's picture in the editor list: a Blur entry's image, a Sequence entry's first photo,
// a classic entry's first Image value
export const thumbOf = (
  entry: Entry,
  attributes: readonly Attribute[],
): string =>
  entry.shots?.find((shot) => shot !== "") ??
  (entry.photo ||
    (attributes
      .filter((attr) => attr.type === "image")
      .map((attr) => entry.values[String(attr.id)]?.[0])
      .find(Boolean) ??
      ""));
