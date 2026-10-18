// Anonymous play: the browser keeps pet ids, the server grades them.
import { FAILURES } from "./failures.ts";
import type { FreeHint, HintChoices, HintKind } from "./free-hint.ts";
import {
  isAnswerRow,
  SKIP,
  type EntryRef,
  type GradedAttribute,
} from "./game.ts";
import {
  createGameState,
  type GameState,
  type StateStorage,
} from "./game-state.ts";
import { call, failureMessage, type Fetch } from "./transport.ts";

// What a finished day reveals: the answer's name, its description when it has one, and a Blur
// game's whole image
export interface Reveal {
  answer?: string;
  answerPhoto?: string;
  answerDescription?: string;
}

// POST /api/games/:slug/grade; `answer` (the entry's name) is present only once the day is
// over (victory, or a Blur game's tries used up: `lost`)
interface GradeResponse extends Reveal {
  day: number;
  rows: GradedAttribute[][];
  victory: boolean;
  lost?: true;
  // Classic games: the hint kinds these guesses would get
  hints?: HintChoices;
}

// POST /api/games/:slug/hint
interface HintResponse {
  day: number;
  hint: FreeHint;
}

// POST /api/games/:slug/give-up
interface GiveUpResponse extends Reveal {
  day: number;
  answer: string;
}

// The Free Hint, once used, and the kinds on offer while it is not
export interface HintState {
  hint?: FreeHint;
  hints?: HintChoices;
}

export interface Loaded extends Reveal, HintState {
  rows: GradedAttribute[][];
  victory: boolean;
  gaveUp?: true;
  // Blur games: every try used without the answer
  lost?: true;
}

// The reveal fields present in a response
export const revealIn = (res: Reveal): Reveal => ({
  ...(res.answer !== undefined && { answer: res.answer }),
  ...(res.answerPhoto !== undefined && { answerPhoto: res.answerPhoto }),
  ...(res.answerDescription !== undefined && {
    answerDescription: res.answerDescription,
  }),
});

// Why today's game could not be loaded, as the text for the player
export interface LoadFailure {
  failure: string;
}

// A POST the server did not accept: too many requests, or the text of why not
type Refused = { kind: "rate_limited" } | { kind: "error"; message: string };

// The player's text for a refused POST
export const refusalText = (refused: Refused): string =>
  refused.kind === "error" ? refused.message : FAILURES.rate_limited.text;

export type SubmitResult =
  | { kind: "invalid" }
  | { kind: "duplicate" }
  // `message` says why: unreachable, or the server's reason
  | { kind: "error"; message: string }
  // Too many requests (API JSON or nginx plain text); nothing changed, retry later
  | { kind: "rate_limited" }
  // The game is over (won or gave up); reset to play again
  | { kind: "finished" }
  | ({
      kind: "accepted";
      row: GradedAttribute[];
      isAnswer: boolean;
      // Blur games: this guess used the last try
      lost?: true;
      // The hint kinds on offer after this guess, while no hint was used
      hints?: HintChoices;
    } & Reveal);

export type HintResult =
  | { kind: "hint"; hint: FreeHint }
  | { kind: "error"; message: string }
  | { kind: "rate_limited" }
  // The server is on a newer day: the game started over
  | { kind: "newday" };

export type GiveUpResult =
  | ({ kind: "gaveUp"; answer: string } & Reveal)
  | { kind: "finished" }
  | { kind: "error"; message: string }
  | { kind: "rate_limited" }
  // The server is on a newer day: the game started over and nothing was revealed
  | { kind: "newday" };

export interface Play {
  // Graded rows of the guesses stored for today, oldest first; the reason if the
  // server could not grade them (the stored guesses stay)
  load(): Promise<Loaded | LoadFailure>;
  // Takes an entry id, or SKIP (Blur games)
  submit(id: number): Promise<SubmitResult>;
  // Reveals the answer and finishes the game
  giveUp(): Promise<GiveUpResult>;
  // Uses the day's Free Hint of this kind
  takeHint(kind: HintKind): Promise<HintResult>;
  // Forgets today's guesses and finished state, so the player can replay;
  // false if it could not be done
  reset(): boolean | Promise<boolean>;
  // Entry ids
  getUsedGuesses(): number[];
}

export interface PlayDeps {
  slug: string;
  roster: readonly EntryRef[];
  storage: StateStorage;
  now: () => Date;
  fetch: Fetch;
  // Called when a response shows the server is on a newer day and the stored
  // game was forgotten, so the page can clear what it shows
  onNewDay?: () => void;
  // A past day's Day Number: graded against that day's answer, and its
  // `storage` (pastDayStorage) never expires
  day?: number;
}

export function createPlay({
  slug,
  roster,
  storage,
  now,
  fetch,
  onNewDay = (): void => {},
  day: pastDay,
}: PlayDeps): Play {
  const state: GameState = createGameState(storage, now, pastDay === undefined);
  // Won, gave up or lost; not stored, it is re-derived on load
  let finished: boolean = false;
  const base: string = `/api/games/${slug}`;
  const query: string = pastDay === undefined ? "" : `?day=${pastDay}`;
  const gradeUrl: string = `${base}/grade${query}`;
  const giveUpUrl: string = `${base}/give-up${query}`;
  const hintUrl: string = `${base}/hint${query}`;
  // The kinds on offer from a grade response, unless the browser already used its hint
  const offered = (res: GradeResponse): HintChoices | undefined =>
    state.getHint() === null ? res.hints : undefined;

  // The parsed body of a successful POST, or why there is none
  async function post<T>(url: string, body: unknown): Promise<T | Refused> {
    const res = await call(fetch, url, body);
    if (res?.status === 429) {
      return { kind: "rate_limited" };
    }
    return res?.ok
      ? (res.data as T)
      : { kind: "error", message: failureMessage(res) };
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
    async load(): Promise<Loaded | LoadFailure> {
      const ids: number[] = state.getUsedGuesses();
      const gaveUp: boolean = state.getGaveUp();
      const loaded: Loaded = { rows: [], victory: false };
      if (ids.length > 0) {
        const res = await post<GradeResponse>(gradeUrl, { ids });
        if ("kind" in res) {
          return { failure: refusalText(res) };
        }
        if (isNewDay(res.day)) {
          return { rows: [], victory: false };
        }
        state.setDay(res.day);
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
        const res = await post<GiveUpResponse>(giveUpUrl, {});
        if ("kind" in res) {
          return { failure: refusalText(res) };
        }
        if (isNewDay(res.day)) {
          return { rows: [], victory: false };
        }
        state.setDay(res.day);
        Object.assign(loaded, revealIn(res));
        loaded.gaveUp = true;
      }
      finished = loaded.victory || gaveUp || loaded.lost === true;
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
      });
      if ("kind" in res) {
        return res;
      }
      if (isNewDay(res.day)) {
        return play.submit(id);
      }
      state.addUsedGuess(id);
      state.setDay(res.day);
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
        return res;
      }
      if (isNewDay(res.day)) {
        return { kind: "newday" };
      }
      state.setHint(res.hint);
      return { kind: "hint", hint: res.hint };
    },

    async giveUp(): Promise<GiveUpResult> {
      if (finished) {
        return { kind: "finished" };
      }
      const res = await post<GiveUpResponse>(giveUpUrl, {});
      if ("kind" in res) {
        return res;
      }
      if (isNewDay(res.day)) {
        return { kind: "newday" };
      }
      state.setGaveUp();
      state.setDay(res.day);
      finished = true;
      return { kind: "gaveUp", answer: res.answer, ...revealIn(res) };
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
