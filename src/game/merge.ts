// On sign-in, hands leftover anonymous Game State to the server (POST /api/games/:slug/state/merge).
import { createGameState, type StateStorage } from "./game-state.ts";
import { call, type Fetch } from "./transport.ts";

// The server refused the payload: invalid, or it conflicts with the account's day
const REFUSED = [400, 409];

// merged: adopted; discarded: the server's state wins, or the local day or
// answer is stale; error: could not decide, local state kept for the next load
export type MergeOutcome =
  "nothing" | "merged" | "discarded" | "rate_limited" | "error";

export async function mergeLocalGame(
  slug: string,
  storage: StateStorage,
  now: () => Date,
  fetch: Fetch,
): Promise<MergeOutcome> {
  const state = createGameState(storage, now);
  const ids: number[] = state.getUsedGuesses();
  const gaveUp: boolean = state.getGaveUp();
  if (ids.length === 0 && !gaveUp) {
    return "nothing";
  }
  const day: number | null = state.getDay();
  if (day === null) {
    state.reset();
    return "discarded";
  }
  const res = await call(
    fetch,
    `/api/games/${slug}/state/merge`,
    { day, revision: state.getRevision(), ids, gaveUp },
    false,
  );
  if (res?.status === 200) {
    state.reset();
    return "merged";
  }
  if (res?.status === 429) {
    return "rate_limited";
  }
  if (res && REFUSED.includes(res.status)) {
    state.reset();
    return "discarded";
  }
  return "error";
}
