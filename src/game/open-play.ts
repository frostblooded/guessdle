// Where a Play page's game lives: the browser for anonymous players, the server once signed in.
import type { EntryRef } from "./game.ts";
import {
  gameStorage,
  pastDayStorage,
  type StateStorage,
} from "./game-state.ts";
import { mergeLocalGame } from "./merge.ts";
import { createPlay, type Play } from "./play.ts";
import { createServerPlay } from "./server-play.ts";
import type { Fetch } from "./transport.ts";

export interface OpenPlayDeps {
  slug: string;
  roster: readonly EntryRef[];
  // The whole browser storage; the game's (or past day's) keys are picked here
  storage: StateStorage;
  signedIn: boolean;
  // A past day's Day Number; today when absent
  day?: number | undefined;
  now: () => Date;
  fetch: Fetch;
  onNewDay: () => void;
}

// The Play for the page, and whether moving today's browser guesses to the account was rate limited
export async function openPlay({
  slug,
  roster,
  storage,
  signedIn,
  day,
  now,
  fetch,
  onNewDay,
}: OpenPlayDeps): Promise<{ play: Play; rateLimited: boolean }> {
  const past = day === undefined ? {} : { day };
  const local =
    day === undefined
      ? gameStorage(storage, slug)
      : pastDayStorage(storage, slug, day);
  if (!signedIn) {
    return {
      play: createPlay({
        slug,
        roster,
        storage: local,
        now,
        fetch,
        onNewDay,
        ...past,
      }),
      rateLimited: false,
    };
  }
  // Only today's browser guesses move to the account; past days stay where they were played
  const merged =
    day === undefined ? await mergeLocalGame(slug, local, now, fetch) : null;
  return {
    play: createServerPlay({ slug, fetch, onNewDay, ...past }),
    rateLimited: merged === "rate_limited",
  };
}
