// Signed-in play: guesses, give-up and reset live on the server (/api/game).
import { isAnswerRow, type GradedAttribute } from "./game.ts";
import type { GiveUpResult, Loaded, Play, SubmitResult } from "./play.ts";
import { call, failureOf, type Fetch } from "./transport.ts";

// The server's view of today's game
interface GameResponse {
  day: number;
  ids: string[];
  rows: GradedAttribute[][];
  victory: boolean;
  gaveUp: boolean;
  answer?: string;
}

export interface ServerPlayDeps {
  fetch: Fetch;
  // Called when a response shows the server is on a newer day than the page
  onNewDay?: () => void;
}

export function createServerPlay({
  fetch,
  onNewDay = (): void => {},
}: ServerPlayDeps): Play {
  let ids: string[] = [];
  let finished: boolean = false;
  let day: number | null = null;

  function adopt(game: GameResponse): void {
    if (day !== null && day !== game.day) {
      onNewDay();
    }
    day = game.day;
    ids = game.ids;
    finished = game.victory || game.gaveUp;
  }

  const errorOf = (data: unknown): string | undefined =>
    (data as { error?: string } | null)?.error;

  const play: Play = {
    async load(): Promise<Loaded | null> {
      const res = await call(fetch, "/api/game");
      if (res?.status !== 200) {
        return null;
      }
      const game = res.data as GameResponse;
      adopt(game);
      return {
        rows: game.rows,
        victory: game.victory,
        ...(game.answer !== undefined && { answer: game.answer }),
        ...(game.gaveUp && { gaveUp: true as const }),
      };
    },

    async submit(id: string): Promise<SubmitResult> {
      if (finished) {
        return { kind: "finished" };
      }
      const res = await call(fetch, "/api/game/guess", { id });
      const failure = failureOf(res);
      if (failure !== null) {
        return { kind: failure };
      }
      if (res!.status === 200) {
        const game = res!.data as GameResponse;
        adopt(game);
        const row = game.rows[game.rows.length - 1]!;
        return {
          kind: "accepted",
          row,
          isAnswer: isAnswerRow(row),
          ...(game.answer !== undefined && { answer: game.answer }),
        };
      }
      const error = errorOf(res!.data);
      if (error === "finished") {
        finished = true;
        return { kind: "finished" };
      }
      if (error === "duplicate" || error === "invalid") {
        return { kind: error };
      }
      return { kind: "error" };
    },

    async giveUp(): Promise<GiveUpResult> {
      if (finished) {
        return { kind: "finished" };
      }
      const res = await call(fetch, "/api/game/give-up", {});
      const failure = failureOf(res);
      if (failure !== null) {
        return { kind: failure };
      }
      if (res!.status === 200) {
        const game = res!.data as GameResponse;
        adopt(game);
        return { kind: "gaveUp", answer: game.answer! };
      }
      if (errorOf(res!.data) === "finished") {
        finished = true;
        return { kind: "finished" };
      }
      return { kind: "error" };
    },

    async reset(): Promise<boolean> {
      const res = await call(fetch, "/api/game/reset", {});
      if (res?.status !== 200) {
        return false;
      }
      adopt(res.data as GameResponse);
      return true;
    },

    getUsedGuesses: (): string[] => ids,
  };
  return play;
}
