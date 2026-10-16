// On sign-in, hands leftover anonymous Game State to the server (POST /api/game/merge).
import { createGameState, type StateStorage } from "./game-state.ts";
import type { FetchLike } from "./play.ts";

// merged: adopted; discarded: the server's state wins or the local day is
// stale; error: could not decide, local state kept for the next load
export type MergeOutcome =
  "nothing" | "merged" | "discarded" | "rate_limited" | "error";

export async function mergeLocalGame(
  storage: StateStorage,
  now: () => Date,
  fetch: FetchLike,
): Promise<MergeOutcome> {
  const state = createGameState(storage, now);
  const ids: string[] = state.getUsedGuesses();
  const gaveUp: boolean = state.getGaveUp();
  if (ids.length === 0 && !gaveUp) {
    return "nothing";
  }
  const day: number | null = state.getDay();
  if (day === null) {
    state.reset();
    return "discarded";
  }
  try {
    const res = await fetch("/api/game/merge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ day, ids, gaveUp }),
    });
    if (res.status === 200) {
      state.reset();
      return "merged";
    }
    if (res.status === 429) {
      return "rate_limited";
    }
    if (res.status === 409 || res.status === 400) {
      state.reset();
      return "discarded";
    }
  } catch {
    // fall through
  }
  return "error";
}
