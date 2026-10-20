// Signed-in play: guesses, give-up and reset live on the server (/api/game).
import { isOver } from "./board.ts";
import { isAnswerRow, type GradedAttribute } from "./game.ts";
import type { HintKind } from "./free-hint.ts";
import { boardClock, type StateStorage } from "./game-state.ts";
import {
  refusalText,
  refusedOf,
  revealIn,
  type HintResult,
  type HintState,
  type GiveUpResult,
  type LoadFailure,
  type Loaded,
  type Play,
  type Reveal,
  type SubmitResult,
} from "./play.ts";
import { failureText } from "./failures.ts";
import { send, type Fetch } from "./transport.ts";

// The server's view of today's game
interface GameResponse extends Reveal, HintState {
  day: number;
  // The answer's revision; it grows when an override changes the day's answer
  revision: number;
  ids: number[];
  rows: GradedAttribute[][];
  victory: boolean;
  gaveUp: boolean;
  lost?: true;
}

export interface ServerPlayDeps {
  slug: string;
  fetch: Fetch;
  // Called when a response shows the server is on a newer day than the page
  onNewDay?: () => void;
  // Called after onNewDay when the day's answer changed since this browser last saw
  // progress on it: the server already wiped that progress
  onAnswerChanged?: () => void;
  // The game's (or past day's) browser keys: where the last seen revision is kept
  storage?: StateStorage;
  // A past day's Day Number; today when absent
  day?: number;
}

// The day and revision this browser last saw the player's progress on
const SEEN_KEY = "progressSeen";

export function createServerPlay({
  slug,
  fetch,
  onNewDay = (): void => {},
  onAnswerChanged = (): void => {},
  storage,
  day: pastDay,
}: ServerPlayDeps): Play {
  const base = `/api/games/${slug}/state`;
  const query = pastDay === undefined ? "" : `?day=${pastDay}`;
  let ids: number[] = [];
  let finished: boolean = false;
  let day: number | null = null;

  function adopt(game: GameResponse): void {
    if (day !== null && day !== game.day) {
      onNewDay();
    }
    day = game.day;
    ids = game.ids;
    finished = isOver({
      won: game.victory,
      gaveUp: game.gaveUp,
      lost: game.lost,
    });
    noteRevision(game);
  }

  // Tells the page once when the progress this browser saw was wiped by an answer change.
  // Blocked storage only loses the notice.
  function noteRevision(game: GameResponse): void {
    try {
      const seen: unknown = JSON.parse(storage?.getItem(SEEN_KEY) ?? "null");
      if (
        Array.isArray(seen) &&
        seen[0] === game.day &&
        seen[1] !== game.revision
      ) {
        onNewDay();
        onAnswerChanged();
      }
      if (game.ids.length > 0 || game.gaveUp) {
        storage?.setItem(SEEN_KEY, JSON.stringify([game.day, game.revision]));
      } else {
        storage?.removeItem(SEEN_KEY);
      }
    } catch {
      // no notice
    }
  }

  const hintsIn = (game: GameResponse): HintState => ({
    ...(game.hint && { hint: game.hint }),
    ...(game.hints && { hints: game.hints }),
  });

  const request = (path: string, body?: unknown) =>
    send<GameResponse>(fetch, `${base}${path}${query}`, body);

  const play: Play = {
    async load(): Promise<Loaded | LoadFailure> {
      const game = await request("");
      if ("kind" in game) {
        return { failure: refusalText(game) };
      }
      adopt(game);
      return {
        rows: game.rows,
        victory: game.victory,
        ...hintsIn(game),
        ...revealIn(game),
        ...(game.gaveUp && { gaveUp: true as const }),
        ...(game.lost && { lost: true as const }),
      };
    },

    async submit(id: number): Promise<SubmitResult> {
      if (finished) {
        return { kind: "finished" };
      }
      const game = await request("/guess", { id });
      if ("kind" in game) {
        const code = game.kind === "error" ? game.code : undefined;
        if (code === "finished") {
          finished = true;
          return { kind: "finished" };
        }
        return code === "duplicate" || code === "invalid"
          ? { kind: code }
          : refusedOf(game);
      }
      adopt(game);
      const row = game.rows[game.rows.length - 1]!;
      return {
        kind: "accepted",
        row,
        isAnswer: isAnswerRow(row),
        ...(game.hints && { hints: game.hints }),
        ...(game.lost && { lost: true as const }),
        ...revealIn(game),
      };
    },

    async giveUp(): Promise<GiveUpResult> {
      if (finished) {
        return { kind: "finished" };
      }
      const game = await request("/give-up", {});
      if ("kind" in game) {
        if (game.kind === "error" && game.code === "finished") {
          finished = true;
          return { kind: "finished" };
        }
        return refusedOf(game);
      }
      adopt(game);
      return { kind: "gaveUp", answer: game.answer!, ...revealIn(game) };
    },

    async takeHint(kind: HintKind): Promise<HintResult> {
      const game = await request("/hint", { kind });
      if ("kind" in game) {
        return refusedOf(game);
      }
      if (!game.hint) {
        // A success without the hint: nothing the player can act on
        return { kind: "error", message: failureText(undefined, 200) };
      }
      adopt(game);
      return { kind: "hint", hint: game.hint };
    },

    async reset(): Promise<boolean> {
      const game = await request("/reset", {});
      if ("kind" in game) {
        return false;
      }
      adopt(game);
      return true;
    },

    getUsedGuesses: (): number[] => ids,
    getDay: (): number | null => day,
    ...boardClock(storage, () => day),
  };
  return play;
}
