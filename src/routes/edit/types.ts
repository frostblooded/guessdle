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
  description: string;
  values: Record<string, string[]>;
  blurOrder?: number[] | null;
  quiz?: QuizSpec | null;
  shots?: string[];
}

export const IMAGE_TYPES = "image/jpeg,image/png,image/webp";

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
