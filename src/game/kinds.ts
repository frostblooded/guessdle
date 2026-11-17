import type { GameKind } from "./blur.ts";
import { DEFAULT_SHOTS, MAX_BLUR_TRIES } from "./limits.ts";
import { hasAllShots } from "./sequence.ts";

export interface KindRules {
  photo: boolean;
  blurOrder: boolean;
  shots: boolean;
  quiz: boolean;
  pauses: boolean;
  tries: number;
}

export const KINDS: Record<GameKind, KindRules> = {
  classic: {
    photo: false,
    blurOrder: false,
    shots: false,
    quiz: false,
    pauses: true,
    tries: MAX_BLUR_TRIES,
  },
  blur: {
    photo: true,
    blurOrder: true,
    shots: false,
    quiz: false,
    pauses: true,
    tries: MAX_BLUR_TRIES,
  },
  sequence: {
    photo: false,
    blurOrder: false,
    shots: true,
    quiz: false,
    pauses: false,
    tries: DEFAULT_SHOTS,
  },
  quiz: {
    photo: true,
    blurOrder: false,
    shots: false,
    quiz: true,
    pauses: true,
    tries: MAX_BLUR_TRIES,
  },
};

export interface EntryParts {
  photo?: string | undefined;
  blurOrder?: readonly number[] | null | undefined;
  shots?: readonly string[] | undefined;
  quiz?: unknown;
}

export function isComplete(
  kind: GameKind,
  entry: EntryParts,
  { valuesFilled, tries }: { valuesFilled: boolean; tries: number },
): boolean {
  switch (kind) {
    case "classic":
      return valuesFilled;
    case "blur":
      return Boolean(entry.photo) && Boolean(entry.blurOrder);
    case "sequence":
      return hasAllShots(entry.shots ?? [], tries);
    case "quiz":
      return entry.quiz !== undefined && entry.quiz !== null;
  }
}
