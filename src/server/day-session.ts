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

export interface StoredBoard {
  ids: number[];
  gaveUp: boolean;
  hint: HintPick | null;
}

export interface DayStore {
  read(): Promise<StoredBoard>;
  addGuess(id: number): Promise<boolean>;
  giveUp(): Promise<void>;
  setHint(pick: HintPick): Promise<boolean>;
  adopt(ids: readonly number[], gaveUp: boolean): Promise<void>;
  reset(): Promise<void>;
  seconds(): Promise<number | null>;
}

export interface GameView {
  day: number;
  revision: number;
  ids: number[];
  rows: GradedAttribute[][];
  victory: boolean;
  gaveUp: boolean;
  lost?: true;
  answer?: string;
  answerPhoto?: string;
  answerDescription?: string;
  hint?: FreeHint;
  hints?: HintChoices;
}

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
  guesses: number;
  seconds: unknown;
}

export interface DaySession {
  view(): Promise<GameView | "invalid" | "duplicate">;
  guess(id: unknown): Promise<GameView | Refusal>;
  giveUp(): Promise<GameView | Refusal>;
  hint(kind: unknown): Promise<GameView | Refusal>;
  merge(local: Record<string, unknown>): Promise<GameView | Refusal>;
  reset(): Promise<GameView | Refusal>;
  win(seconds: unknown, guestToken?: string): Promise<Win | "not_won">;
}

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
      if (!pick || !(await store.setHint(pick))) {
        return "no_hint";
      }
      return after();
    },

    async merge(local: Record<string, unknown>) {
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
