// Anonymous play: the browser keeps pet ids, the server grades them.
import { Correctness } from "./correctness.ts";
import type { GradedAttribute } from "./game.ts";
import {
  createGameState,
  type GameState,
  type StateStorage,
} from "./game-state.ts";
import type { Pet } from "./roster.ts";

// The part of fetch that play uses
export type FetchLike = (
  url: string,
  init: { method: "POST"; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

// POST /api/grade; `answer` (the pet's name) is present only on victory
interface GradeResponse {
  day: number;
  rows: GradedAttribute[][];
  victory: boolean;
  answer?: string;
}

export interface Loaded {
  rows: GradedAttribute[][];
  victory: boolean;
  answer?: string;
}

export type SubmitResult =
  | { kind: "invalid" }
  | { kind: "duplicate" }
  | { kind: "error" }
  | {
      kind: "accepted";
      row: GradedAttribute[];
      isAnswer: boolean;
      answer?: string;
    };

export interface Play {
  // Graded rows of the guesses stored for today, oldest first; null if the
  // server could not be reached (the stored guesses stay)
  load(): Promise<Loaded | null>;
  // Takes a pet id
  submit(id: string): Promise<SubmitResult>;
  // Pet ids
  getUsedGuesses(): string[];
}

export interface PlayDeps {
  roster: readonly Pet[];
  storage: StateStorage;
  now: () => Date;
  fetch: FetchLike;
}

export function createPlay({ roster, storage, now, fetch }: PlayDeps): Play {
  const state: GameState = createGameState(storage, now);
  // Before ids, guesses were stored by display name: upgrade them, drop unknowns
  const stored: string[] = state.getUsedGuesses();
  const upgraded: string[] = stored.flatMap((entry: string): string[] => {
    const pet: Pet | undefined = roster.find(
      (item: Pet): boolean => item.id === entry || item.name === entry,
    );
    return pet ? [pet.id] : [];
  });
  if (upgraded.join() !== stored.join()) {
    state.setUsedGuesses(upgraded);
  }

  async function grade(ids: string[]): Promise<GradeResponse | null> {
    try {
      const res = await fetch("/api/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      return res.ok ? ((await res.json()) as GradeResponse) : null;
    } catch {
      return null;
    }
  }

  // True if the response is from a newer day than the stored guesses, which
  // are then forgotten
  function isNewDay(res: GradeResponse): boolean {
    const day: number | null = state.getDay();
    if (day !== null && day !== res.day) {
      state.reset();
      return true;
    }
    return false;
  }

  const play: Play = {
    async load(): Promise<Loaded | null> {
      const ids: string[] = state.getUsedGuesses();
      if (ids.length === 0) {
        return { rows: [], victory: false };
      }
      const res: GradeResponse | null = await grade(ids);
      if (res === null) {
        return null;
      }
      if (isNewDay(res)) {
        return { rows: [], victory: false };
      }
      state.setDay(res.day);
      return {
        rows: res.rows,
        victory: res.victory,
        ...(res.answer !== undefined && { answer: res.answer }),
      };
    },

    async submit(id: string): Promise<SubmitResult> {
      if (!roster.some((pet: Pet): boolean => pet.id === id)) {
        return { kind: "invalid" };
      }
      const used: string[] = state.getUsedGuesses();
      if (used.includes(id)) {
        return { kind: "duplicate" };
      }
      const res: GradeResponse | null = await grade([...used, id]);
      if (res === null) {
        return { kind: "error" };
      }
      if (isNewDay(res)) {
        return play.submit(id);
      }
      state.addUsedGuess(id);
      state.setDay(res.day);
      const row: GradedAttribute[] = res.rows[res.rows.length - 1]!;
      const isAnswer: boolean = row.every(
        (cell: GradedAttribute): boolean =>
          cell.correctness === Correctness.Correct,
      );
      return {
        kind: "accepted",
        row,
        isAnswer,
        ...(res.answer !== undefined && { answer: res.answer }),
      };
    },

    getUsedGuesses: state.getUsedGuesses,
  };
  return play;
}
