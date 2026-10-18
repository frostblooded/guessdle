// What the editor's API calls answer with.
import type { GameKind } from "../../game/blur.ts";
import { hasAllShots } from "../../game/sequence.ts";

export interface Attribute {
  id: number;
  name: string;
  type: "text" | "list" | "number" | "image";
}

export interface Entry {
  id: number;
  name: string;
  photo: string;
  values: Record<string, string[]>;
  // Blur games only: the order the squares clear in, null until picked
  blurOrder?: number[] | null;
  // Sequence games only: the photos in order, "" for an empty slot
  shots?: string[];
}

export const IMAGE_TYPES = "image/jpeg,image/png,image/webp";

// An entry missing what its game needs: values, a Blur image and order, or (guess-only, not
// pausing) a Sequence game's `tries` photos
export const isIncomplete = (
  entry: Entry,
  kind: GameKind,
  tries: number,
  attributes: readonly Attribute[],
): boolean =>
  kind === "sequence"
    ? !hasAllShots(entry.shots ?? [], tries)
    : kind === "blur"
      ? !entry.photo || !entry.blurOrder
      : attributes.some(
          (attr) =>
            attr.type !== "image" && !entry.values[String(attr.id)]?.length,
        );

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
