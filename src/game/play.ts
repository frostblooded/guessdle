// Anonymous play: the browser keeps pet ids, the server grades them.
import { isAnswerRow, type GradedAttribute } from "./game.ts";
import {
  createGameState,
  type GameState,
  type StateStorage,
} from "./game-state.ts";
import type { Pet } from "./roster.ts";
import { call, failureOf, type Failure, type Fetch } from "./transport.ts";

// POST /api/grade; `answer` (the pet's name) is present only on victory
interface GradeResponse {
  day: number;
  rows: GradedAttribute[][];
  victory: boolean;
  answer?: string;
}

// POST /api/give-up
interface GiveUpResponse {
  day: number;
  answer: string;
}

export interface Loaded {
  rows: GradedAttribute[][];
  victory: boolean;
  // The answer's name: present on victory and after a give-up
  answer?: string;
  gaveUp?: true;
}

export type SubmitResult =
  | { kind: "invalid" }
  | { kind: "duplicate" }
  | { kind: "error" }
  // Too many requests (API JSON or nginx plain text); nothing changed, retry later
  | { kind: "rate_limited" }
  // The game is over (won or gave up); reset to play again
  | { kind: "finished" }
  | {
      kind: "accepted";
      row: GradedAttribute[];
      isAnswer: boolean;
      answer?: string;
    };

export type GiveUpResult =
  | { kind: "gaveUp"; answer: string }
  | { kind: "finished" }
  | { kind: "error" }
  | { kind: "rate_limited" }
  // The server is on a newer day: the game started over and nothing was revealed
  | { kind: "newday" };

export interface Play {
  // Graded rows of the guesses stored for today, oldest first; null if the
  // server could not be reached (the stored guesses stay)
  load(): Promise<Loaded | null>;
  // Takes a pet id
  submit(id: string): Promise<SubmitResult>;
  // Reveals the answer and finishes the game
  giveUp(): Promise<GiveUpResult>;
  // Forgets today's guesses and finished state, so the player can replay;
  // false if it could not be done
  reset(): boolean | Promise<boolean>;
  // Pet ids
  getUsedGuesses(): string[];
}

export interface PlayDeps {
  roster: readonly Pet[];
  storage: StateStorage;
  now: () => Date;
  fetch: Fetch;
  // Called when a response shows the server is on a newer day and the stored
  // game was forgotten, so the page can clear what it shows
  onNewDay?: () => void;
}

export function createPlay({
  roster,
  storage,
  now,
  fetch,
  onNewDay = (): void => {},
}: PlayDeps): Play {
  const state: GameState = createGameState(storage, now);
  // Won or gave up; not stored, it is re-derived on load
  let finished: boolean = false;
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

  // The parsed body of a successful POST, or why there is none
  async function post<T>(url: string, body: unknown): Promise<T | Failure> {
    const res = await call(fetch, url, body);
    return failureOf(res) ?? (res!.ok ? (res!.data as T) : "error");
  }

  // True if the response is from a newer day than the stored game, which is
  // then forgotten
  function isNewDay(responseDay: number): boolean {
    const day: number | null = state.getDay();
    if (day !== null && day !== responseDay) {
      state.reset();
      finished = false;
      onNewDay();
      return true;
    }
    return false;
  }

  const play: Play = {
    async load(): Promise<Loaded | null> {
      const ids: string[] = state.getUsedGuesses();
      const gaveUp: boolean = state.getGaveUp();
      const loaded: Loaded = { rows: [], victory: false };
      if (ids.length > 0) {
        const res = await post<GradeResponse>("/api/grade", { ids });
        if (typeof res === "string") {
          return null;
        }
        if (isNewDay(res.day)) {
          return { rows: [], victory: false };
        }
        state.setDay(res.day);
        loaded.rows = res.rows;
        loaded.victory = res.victory;
        if (res.answer !== undefined) {
          loaded.answer = res.answer;
        }
      }
      if (gaveUp) {
        const res = await post<GiveUpResponse>("/api/give-up", {});
        if (typeof res === "string") {
          return null;
        }
        if (isNewDay(res.day)) {
          return { rows: [], victory: false };
        }
        state.setDay(res.day);
        loaded.answer = res.answer;
        loaded.gaveUp = true;
      }
      finished = loaded.victory || gaveUp;
      return loaded;
    },

    async submit(id: string): Promise<SubmitResult> {
      if (finished) {
        return { kind: "finished" };
      }
      if (!roster.some((pet: Pet): boolean => pet.id === id)) {
        return { kind: "invalid" };
      }
      const used: string[] = state.getUsedGuesses();
      if (used.includes(id)) {
        return { kind: "duplicate" };
      }
      const res = await post<GradeResponse>("/api/grade", {
        ids: [...used, id],
      });
      if (typeof res === "string") {
        return { kind: res };
      }
      if (isNewDay(res.day)) {
        return play.submit(id);
      }
      state.addUsedGuess(id);
      state.setDay(res.day);
      const row: GradedAttribute[] = res.rows[res.rows.length - 1]!;
      const isAnswer: boolean = isAnswerRow(row);
      finished = isAnswer;
      return {
        kind: "accepted",
        row,
        isAnswer,
        ...(res.answer !== undefined && { answer: res.answer }),
      };
    },

    async giveUp(): Promise<GiveUpResult> {
      if (finished) {
        return { kind: "finished" };
      }
      const res = await post<GiveUpResponse>("/api/give-up", {});
      if (typeof res === "string") {
        return { kind: res };
      }
      if (isNewDay(res.day)) {
        return { kind: "newday" };
      }
      state.setGaveUp();
      state.setDay(res.day);
      finished = true;
      return { kind: "gaveUp", answer: res.answer };
    },

    reset(): boolean {
      state.reset();
      finished = false;
      return true;
    },

    getUsedGuesses: state.getUsedGuesses,
  };
  return play;
}
