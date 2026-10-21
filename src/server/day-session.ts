// One player's Board on one Day of play, whoever plays it: every play action (guess, give-up,
// Free Hint, merge, reset, win), the reveal, and the player's first try (results.ts). Where
// the Board lives is the DayStore's business: in the request for a guest (stateless grading,
// ADR 0010), in Postgres once signed in (user-game.ts). Routes only parse and answer.
import type pg from "pg";
import { checkGuess, isOver } from "../game/board.ts";
import type { FailureCode } from "../game/failures.ts";
import {
  isHintKind,
  pickHint,
  revealHint,
  type FreeHint,
  type HintChoices,
  type HintPick,
} from "../game/free-hint.ts";
import { SKIP, type GradedAttribute } from "../game/game.ts";
import type { DayStats } from "../game/stats.ts";
import { boardOf, isLost, triesOf, type PlayDay } from "./play-day.ts";
import { dropGuestResult, recordFailure, recordWin } from "./results.ts";

type Q = Pick<pg.Pool, "query">;

// A Board as a store keeps it: the guesses in order (SKIP for a skip), whether it was given
// up, and the Free Hint drawn
export interface StoredBoard {
  ids: number[];
  gaveUp: boolean;
  hint: HintPick | null;
}

// Where a Board lives. Two adapters: requestStore (a guest's request, nothing kept) and
// userStore (a signed-in player's rows, user-game.ts).
export interface DayStore {
  read(): Promise<StoredBoard>;
  // Appends a guess; false when the Board already holds it
  addGuess(id: number): Promise<boolean>;
  giveUp(): Promise<void>;
  // False when the Board already holds a hint
  setHint(pick: HintPick): Promise<boolean>;
  // Fills an empty Board with these guesses, given up or not (merge)
  adopt(ids: readonly number[], gaveUp: boolean): Promise<void>;
  // Forgets the Board; the player's first try stays
  reset(): Promise<void>;
  // The solve time the store measured itself, else null
  seconds(): Promise<number | null>;
}

// A Board graded against the day's answer, as the signed-in state routes answer it
export interface GameView {
  day: number;
  // The answer's revision: a changed one means the day started over (migration 018)
  revision: number;
  ids: number[];
  rows: GradedAttribute[][];
  victory: boolean;
  gaveUp: boolean;
  // Blur and Sequence games: every try was used without finding the answer
  lost?: true;
  // The answer's name: present once the day is over (victory, give-up or lost)
  answer?: string;
  // Blur games, once the day is over: the answer's whole image
  answerPhoto?: string;
  // Once the day is over, when the answer has one
  answerDescription?: string;
  // Classic games: the Free Hint the player used
  hint?: FreeHint;
  // Classic games: the hint kinds on offer, while the day is on and no hint was used
  hints?: HintChoices;
}

// Why an action is refused; statuses and texts live in FAILURES.
// has_progress, stale_day: merge only (the account already has rows for the day; the
// payload is for another day or an answer since changed). no_hint: none on offer.
export type Refusal = Extract<
  FailureCode,
  | "invalid"
  | "duplicate"
  | "finished"
  | "has_progress"
  | "stale_day"
  | "no_hint"
>;

export interface Win {
  stats: DayStats;
  // The Board the win was recorded from
  guesses: number;
  seconds: unknown;
}

export interface DaySession {
  // The Board graded on read against the current answer, so an overridden answer applies at
  // once. A guest's list can be ungradable. Seeing a Board that ended without a win takes
  // the player's first try for the day, so no later win that day counts.
  view(): Promise<GameView | "invalid" | "duplicate">;
  guess(id: unknown): Promise<GameView | Refusal>;
  giveUp(): Promise<GameView | Refusal>;
  // Draws the day's Free Hint of this kind; the view carries it
  hint(kind: unknown): Promise<GameView | Refusal>;
  // Adopts a browser's anonymous Board for today (POST /state/merge body)
  merge(local: Record<string, unknown>): Promise<GameView | Refusal>;
  reset(): Promise<GameView | Refusal>;
  // Records the Board as the player's first win and answers with the day's stats. A store's
  // own time wins over `seconds` from the browser. `guestToken`: the browser's player token,
  // whose guest result goes once its player signs in (one person is never two players).
  win(seconds: unknown, guestToken?: string): Promise<Win | "not_won">;
}

// `player`: "user:<id>" or "anon:<token>"; null for a guest without a token, whose first try
// is never recorded
export function daySession(
  q: Q,
  day: PlayDay,
  player: string | null,
  store: DayStore,
  random: () => number,
): DaySession {
  const { game, roster, answer } = day;

  async function view(): Promise<GameView | "invalid" | "duplicate"> {
    const stored = await store.read();
    const board = boardOf(day, stored.ids, stored.gaveUp);
    if (typeof board === "string") {
      return board;
    }
    if (
      player !== null &&
      !board.victory &&
      isOver({ won: false, gaveUp: stored.gaveUp, lost: board.lost })
    ) {
      await recordFailure(q, day, player, stored.ids.length);
    }
    const hint =
      stored.hint && revealHint(roster.attributes, answer, stored.hint);
    return {
      day: day.day,
      revision: day.revision,
      ids: stored.ids,
      rows: board.rows,
      victory: board.victory,
      gaveUp: stored.gaveUp,
      ...(board.lost && { lost: true as const }),
      ...board.reveal,
      ...(hint && { hint }),
      ...(!stored.hint && board.hints && { hints: board.hints }),
    };
  }
  const over = (v: GameView): boolean =>
    isOver({ won: v.victory, gaveUp: v.gaveUp, lost: v.lost });
  // The view after a change; a stored Board always grades
  const after = async (): Promise<GameView> => {
    const v = await view();
    if (typeof v === "string") {
      throw new Error("stored guesses are not gradable");
    }
    return v;
  };

  return {
    view,

    async guess(id: unknown) {
      const current = await view();
      if (typeof current === "string") {
        return current;
      }
      const check = checkGuess(game.kind, roster.entries, current.ids, id);
      if (check === "invalid" || typeof id !== "number") {
        return "invalid";
      }
      if (over(current)) {
        return "finished";
      }
      if (check === "duplicate" || !(await store.addGuess(id))) {
        return "duplicate";
      }
      return after();
    },

    async giveUp() {
      const current = await view();
      if (typeof current === "string") {
        return current;
      }
      if (over(current)) {
        return "finished";
      }
      await store.giveUp();
      return after();
    },

    async hint(kind: unknown) {
      if (!isHintKind(kind)) {
        return "invalid";
      }
      const current = await view();
      if (typeof current === "string") {
        return "invalid";
      }
      if (!current.hints) {
        return "no_hint";
      }
      const pick = pickHint(
        roster.attributes,
        answer,
        current.rows,
        kind,
        random,
      );
      // A stored hint whose attribute was since renamed shows nothing, but it was still taken
      if (!pick || !(await store.setHint(pick))) {
        return "no_hint";
      }
      return after();
    },

    async merge(local: Record<string, unknown>) {
      // Only today's browser guesses are adopted; past days stay where they were played
      if (day.past) {
        return "stale_day";
      }
      const { ids, gaveUp } = local;
      const tries = triesOf(game);
      if (
        !Array.isArray(ids) ||
        ids.length > (tries ?? roster.entries.length) ||
        !ids.every(
          (id) => checkGuess(game.kind, roster.entries, [], id) !== "invalid",
        ) ||
        (gaveUp !== undefined && typeof gaveUp !== "boolean")
      ) {
        return "invalid";
      }
      // Browsers from before revisions existed send none: they played revision 0
      if (
        local["day"] !== day.day ||
        (local["revision"] ?? 0) !== day.revision
      ) {
        return "stale_day";
      }
      const current = await store.read();
      if (current.ids.length > 0 || current.gaveUp) {
        return "has_progress";
      }
      // Keep first occurrences (and every skip) in order, stop after the answer
      const keep = (ids as number[]).filter(
        (id, i) => id === SKIP || ids.indexOf(id) === i,
      );
      const end = keep.indexOf(answer.id);
      const adopted = (end === -1 ? keep : keep.slice(0, end + 1)).slice(
        0,
        tries ?? undefined,
      );
      const lost = end === -1 && isLost(game, adopted, false);
      await store.adopt(adopted, gaveUp === true && end === -1 && !lost);
      return after();
    },

    async reset() {
      await store.reset();
      return after();
    },

    async win(seconds: unknown, guestToken?: string) {
      if (player === null) {
        return "not_won";
      }
      if (guestToken !== undefined) {
        await dropGuestResult(q, day, guestToken);
      }
      const { ids } = await store.read();
      const time = (await store.seconds()) ?? seconds;
      const stats = await recordWin(q, day, player, ids, time);
      return stats === "not_won"
        ? stats
        : { stats, guesses: ids.length, seconds: time };
    },
  };
}

// A guest's Board as the request sends it; nothing outlives the request
export function requestStore(ids: readonly number[] = []): DayStore {
  const board: StoredBoard = { ids: [...ids], gaveUp: false, hint: null };
  return {
    read: async () => ({ ...board, ids: [...board.ids] }),
    async addGuess(id: number) {
      if (id !== SKIP && board.ids.includes(id)) {
        return false;
      }
      board.ids.push(id);
      return true;
    },
    async giveUp() {
      board.gaveUp = true;
    },
    async setHint(pick: HintPick) {
      if (board.hint) {
        return false;
      }
      board.hint = pick;
      return true;
    },
    async adopt(adopted: readonly number[], gaveUp: boolean) {
      board.ids = [...adopted];
      board.gaveUp = gaveUp;
    },
    async reset() {
      board.ids = [];
      board.gaveUp = false;
      board.hint = null;
    },
    seconds: async () => null,
  };
}
