import { isOver } from "./board.ts";
import type { FreeHint, HintChoices, HintKind } from "./free-hint.ts";
import {
  isAnswerRow,
  SKIP,
  type EntryRef,
  type GradedAttribute,
} from "./game.ts";
import {
  boardClock,
  createGameState,
  type GameState,
  type StateStorage,
} from "./game-state.ts";
import { send, type Fetch, type Refused } from "./transport.ts";

export interface Reveal {
  answer?: string;
  answerPhoto?: string;
  answerDescription?: string;
}

interface GradeResponse extends Reveal {
  day: number;
  revision: number;
  rows: GradedAttribute[][];
  victory: boolean;
  lost?: true;
  hints?: HintChoices;
}

interface HintResponse {
  day: number;
  revision: number;
  hint: FreeHint;
}

interface GiveUpResponse extends Reveal {
  day: number;
  revision: number;
  answer: string;
}

export interface HintState {
  hint?: FreeHint;
  hints?: HintChoices;
}

export interface Loaded extends Reveal, HintState {
  rows: GradedAttribute[][];
  victory: boolean;
  gaveUp?: true;
  lost?: true;
}

export const revealIn = (res: Reveal): Reveal => ({
  ...(res.answer !== undefined && { answer: res.answer }),
  ...(res.answerPhoto !== undefined && { answerPhoto: res.answerPhoto }),
  ...(res.answerDescription !== undefined && {
    answerDescription: res.answerDescription,
  }),
});

export interface LoadFailure {
  failure: string;
}

export const RATE_LIMITED =
  "Too many requests in a short time. Wait a minute, then try again.";

export const ANSWER_CHANGED =
  "Today's answer was changed, so your board started over.";

export const refusalText = (refused: Refused): string =>
  refused.kind === "error" ? refused.message : RATE_LIMITED;

export const refusedOf = (
  refused: Refused,
): { kind: "rate_limited" } | { kind: "error"; message: string } =>
  refused.kind === "error"
    ? { kind: "error", message: refused.message }
    : refused;

export type SubmitResult =
  | { kind: "invalid" }
  | { kind: "duplicate" }
  | { kind: "error"; message: string }
  | { kind: "rate_limited" }
  | { kind: "finished" }
  | ({
      kind: "accepted";
      row: GradedAttribute[];
      isAnswer: boolean;
      lost?: true;
      hints?: HintChoices;
    } & Reveal);

export type HintResult =
  | { kind: "hint"; hint: FreeHint }
  | { kind: "error"; message: string }
  | { kind: "rate_limited" }
  | { kind: "newday" };

export type GiveUpResult =
  | ({ kind: "gaveUp"; answer: string } & Reveal)
  | { kind: "finished" }
  | { kind: "error"; message: string }
  | { kind: "rate_limited" }
  | { kind: "newday" };

export interface Play {
  load(): Promise<Loaded | LoadFailure>;
  submit(id: number): Promise<SubmitResult>;
  giveUp(): Promise<GiveUpResult>;
  takeHint(kind: HintKind): Promise<HintResult>;
  reset(): boolean | Promise<boolean>;
  getUsedGuesses(): number[];
  getDay(): number | null;
  startClock(): void;
  solveSeconds(): number | null;
}

export interface PlayDeps {
  slug: string;
  roster: readonly EntryRef[];
  storage: StateStorage;
  now: () => Date;
  fetch: Fetch;
  onNewDay?: () => void;
  onAnswerChanged?: () => void;
  day?: number;
  player?: string;
}

export function createPlay({
  slug,
  roster,
  storage,
  now,
  fetch,
  onNewDay = (): void => {},
  onAnswerChanged = (): void => {},
  day: pastDay,
  player,
}: PlayDeps): Play {
  const state: GameState = createGameState(storage, now, pastDay === undefined);
  let finished: boolean = false;
  const base: string = `/api/games/${slug}`;
  const query: string = pastDay === undefined ? "" : `?day=${pastDay}`;
  const gradeUrl: string = `${base}/grade${query}`;
  const giveUpUrl: string = `${base}/give-up${query}`;
  const who = player === undefined ? {} : { player };
  const hintUrl: string = `${base}/hint${query}`;
  const offered = (res: GradeResponse): HintChoices | undefined =>
    state.getHint() === null ? res.hints : undefined;

  const post = <T>(url: string, body: unknown): Promise<T | Refused> =>
    send<T>(fetch, url, body);

  function isNewDay({
    day: responseDay,
    revision,
  }: Pick<GradeResponse, "day" | "revision">): boolean {
    const day: number | null = state.getDay();
    const newDay: boolean = day !== null && day !== responseDay;
    const stored: number | null = state.getRevision();
    if (newDay || (stored !== null && stored !== revision)) {
      state.reset();
      finished = false;
      onNewDay();
      if (!newDay) {
        onAnswerChanged();
      }
      return true;
    }
    state.setDay(responseDay, revision);
    return false;
  }

  const play: Play = {
    async load(): Promise<Loaded | LoadFailure> {
      const ids: number[] = state.getUsedGuesses();
      const gaveUp: boolean = state.getGaveUp();
      const loaded: Loaded = { rows: [], victory: false };
      if (ids.length > 0) {
        const res = await post<GradeResponse>(gradeUrl, { ids, ...who });
        if ("kind" in res) {
          return { failure: refusalText(res) };
        }
        if (isNewDay(res)) {
          return { rows: [], victory: false };
        }
        loaded.rows = res.rows;
        loaded.victory = res.victory;
        if (res.victory) {
          state.setWon();
        }
        Object.assign(loaded, revealIn(res), res.lost && { lost: true });
        const hints = offered(res);
        if (hints) {
          loaded.hints = hints;
        }
      }
      const hint = state.getHint();
      if (hint) {
        loaded.hint = hint;
      }
      if (gaveUp) {
        const res = await post<GiveUpResponse>(giveUpUrl, who);
        if ("kind" in res) {
          return { failure: refusalText(res) };
        }
        if (isNewDay(res)) {
          return { rows: [], victory: false };
        }
        Object.assign(loaded, revealIn(res));
        loaded.gaveUp = true;
      }
      finished = isOver({ won: loaded.victory, gaveUp, lost: loaded.lost });
      return loaded;
    },

    async submit(id: number): Promise<SubmitResult> {
      if (finished) {
        return { kind: "finished" };
      }
      if (
        id !== SKIP &&
        !roster.some((entry: EntryRef): boolean => entry.id === id)
      ) {
        return { kind: "invalid" };
      }
      const used: number[] = state.getUsedGuesses();
      if (id !== SKIP && used.includes(id)) {
        return { kind: "duplicate" };
      }
      const res = await post<GradeResponse>(gradeUrl, {
        ids: [...used, id],
        ...who,
      });
      if ("kind" in res) {
        return refusedOf(res);
      }
      if (isNewDay(res)) {
        return play.submit(id);
      }
      state.addUsedGuess(id);
      const row: GradedAttribute[] = res.rows[res.rows.length - 1]!;
      const isAnswer: boolean = isAnswerRow(row);
      finished = isAnswer || res.lost === true;
      if (isAnswer) {
        state.setWon();
      }
      const hints = offered(res);
      return {
        kind: "accepted",
        row,
        isAnswer,
        ...(res.lost && { lost: true as const }),
        ...(hints && { hints }),
        ...revealIn(res),
      };
    },

    async takeHint(kind: HintKind): Promise<HintResult> {
      const res = await post<HintResponse>(hintUrl, {
        ids: state.getUsedGuesses(),
        kind,
      });
      if ("kind" in res) {
        return refusedOf(res);
      }
      if (isNewDay(res)) {
        return { kind: "newday" };
      }
      state.setHint(res.hint);
      return { kind: "hint", hint: res.hint };
    },

    async giveUp(): Promise<GiveUpResult> {
      if (finished) {
        return { kind: "finished" };
      }
      const res = await post<GiveUpResponse>(giveUpUrl, who);
      if ("kind" in res) {
        return refusedOf(res);
      }
      if (isNewDay(res)) {
        return { kind: "newday" };
      }
      state.setGaveUp();
      finished = true;
      return { kind: "gaveUp", answer: res.answer, ...revealIn(res) };
    },

    reset(): boolean {
      state.reset();
      finished = false;
      return true;
    },

    getUsedGuesses: state.getUsedGuesses,
    getDay: state.getDay,
    ...boardClock(storage, state.getDay, () => now().getTime()),
  };
  return play;
}
