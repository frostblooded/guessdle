// Pure checks of game and entry request input: no database, no HTTP. Upload ownership is a
// database check and stays with the caller.
import {
  MAX_DESCRIPTION,
  MAX_BLUR_TRIES,
  MAX_ENTRY_NAME,
  MAX_LIST_ITEMS,
  MAX_NAME,
  MAX_VALUE_LENGTH,
} from "../game/limits.ts";
import { isBlurOrder, isTryCount } from "../game/blur.ts";
import type { GamePatch } from "./games.ts";
import type { EntryInput } from "./entries.ts";

// A non-empty string of at most max chars once trimmed; undefined otherwise
export const nameIn = (v: unknown, max: number): string | undefined =>
  typeof v === "string" && v.trim() !== "" && v.trim().length <= max
    ? v.trim()
    : undefined;

// The game fields of a PATCH body; undefined when any is malformed. `maxSkip` is the largest
// skip period the roster allows; `blur` whether the game is a Blur or Sequence game, the only
// kinds with a try count. A coverUrl is only shape-checked here.
export function parseGamePatch(
  body: Record<string, unknown>,
  maxSkip: number,
  blur: boolean = false,
): GamePatch | undefined {
  const { name, description, skipPeriod, coverUrl, blurTries } = body;
  const patch: GamePatch = {};
  if (blurTries !== undefined) {
    if (!blur || !isTryCount(blurTries)) {
      return undefined;
    }
    patch.blurTries = blurTries;
  }
  if (name !== undefined) {
    const title = nameIn(name, MAX_NAME);
    if (title === undefined) {
      return undefined;
    }
    patch.name = title;
  }
  if (description !== undefined) {
    if (
      typeof description !== "string" ||
      description.length > MAX_DESCRIPTION
    ) {
      return undefined;
    }
    patch.description = description;
  }
  if (skipPeriod !== undefined) {
    if (
      skipPeriod !== null &&
      !(
        Number.isInteger(skipPeriod) &&
        (skipPeriod as number) >= 0 &&
        (skipPeriod as number) <= maxSkip
      )
    ) {
      return undefined;
    }
    patch.skipPeriod = skipPeriod as number | null;
  }
  if (coverUrl !== undefined) {
    if (typeof coverUrl !== "string") {
      return undefined;
    }
    patch.coverUrl = coverUrl;
  }
  return patch;
}

// The entry fields in a request body; undefined when any is malformed. A photo or a Sequence
// entry's shots are only shape-checked here.
export function parseEntryInput(
  body: Record<string, unknown>,
): EntryInput | undefined {
  const { name, photo, description, values, blurOrder, shots } = body;
  const out: EntryInput = {};
  if (shots !== undefined) {
    if (
      !Array.isArray(shots) ||
      shots.length > MAX_BLUR_TRIES ||
      !shots.every((shot) => typeof shot === "string")
    ) {
      return undefined;
    }
    out.shots = shots as string[];
  }
  if (blurOrder !== undefined) {
    if (!isBlurOrder(blurOrder)) {
      return undefined;
    }
    out.blurOrder = blurOrder;
  }
  if (name !== undefined) {
    const title = nameIn(name, MAX_ENTRY_NAME);
    if (title === undefined) {
      return undefined;
    }
    out.name = title;
  }
  if (photo !== undefined) {
    if (typeof photo !== "string") {
      return undefined;
    }
    out.photo = photo;
  }
  if (description !== undefined) {
    if (
      typeof description !== "string" ||
      description.trim().length > MAX_DESCRIPTION
    ) {
      return undefined;
    }
    out.description = description.trim();
  }
  if (values !== undefined) {
    if (typeof values !== "object" || values === null) {
      return undefined;
    }
    out.values = {};
    for (const [id, raw] of Object.entries(values)) {
      const list: unknown = Array.isArray(raw) ? raw : [raw];
      const items = (list as unknown[]).map((v) =>
        typeof v === "string" ? v.trim() : null,
      );
      if (
        items.length > MAX_LIST_ITEMS ||
        items.some((v) => v === null || v.length > MAX_VALUE_LENGTH)
      ) {
        return undefined;
      }
      out.values[id] = items.filter((v): v is string => v !== "");
    }
  }
  return out;
}
