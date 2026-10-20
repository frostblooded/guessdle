// What each Game Kind (ADRs 0019-0021) stores on an Entry beyond its name, Attribute values
// and Description, and what an Entry needs before it is complete. One table, shared by the
// server (saving, the Roster, pausing) and the editor, so a kind's entry shape lives in one
// place. The gallery's SQL twin, HAS_MISSING_VALUES in server/completeness.ts, is tested
// against it.
import type { GameKind } from "./blur.ts";
import { DEFAULT_SHOTS, MAX_BLUR_TRIES } from "./limits.ts";
import { hasAllShots } from "./sequence.ts";

export interface KindRules {
  // The Entry fields this kind stores: a Blur image or a Quiz picture, a Blur square order,
  // Sequence photos, a Quiz answer
  photo: boolean;
  blurOrder: boolean;
  shots: boolean;
  quiz: boolean;
  // Whether an incomplete Entry pauses the game. A Sequence Entry never does on its own:
  // without every photo it just cannot be the answer (the game pauses once none can).
  pauses: boolean;
  // A new game's tries (Blur) or photos per Entry (Sequence); other kinds ignore it
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

// An Entry's kind-specific parts, as the server and the editor both hold them
export interface EntryParts {
  photo?: string | undefined;
  blurOrder?: readonly number[] | null | undefined;
  shots?: readonly string[] | undefined;
  quiz?: unknown;
}

// Whether an Entry has what its kind needs: a Classic Entry every (non-Image) Attribute
// value, a Blur Entry its image and square order, a Sequence Entry its game's `tries`
// photos, a Quiz question its answer. `valuesFilled` is the caller's to work out, since the
// server and the editor hold values in different shapes.
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
