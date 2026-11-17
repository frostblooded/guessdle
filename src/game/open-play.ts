import type { EntryRef } from "./game.ts";
import {
  gameStorage,
  pastDayStorage,
  type StateStorage,
} from "./game-state.ts";
import { mergeLocalGame } from "./merge.ts";
import { createPlay, type Play } from "./play.ts";
import { createServerPlay } from "./server-play.ts";
import { playerToken } from "./stats.ts";
import type { Fetch } from "./transport.ts";

export interface OpenPlayDeps {
  slug: string;
  roster: readonly EntryRef[];
  storage: StateStorage;
  signedIn: boolean;
  day?: number | undefined;
  now: () => Date;
  fetch: Fetch;
  onNewDay: () => void;
  onAnswerChanged: () => void;
}

export async function openPlay({
  slug,
  roster,
  storage,
  signedIn,
  day,
  now,
  fetch,
  onNewDay,
  onAnswerChanged,
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
        onAnswerChanged,
        ...past,
        player: playerToken(storage),
      }),
      rateLimited: false,
    };
  }
  const merged =
    day === undefined ? await mergeLocalGame(slug, local, now, fetch) : null;
  return {
    play: createServerPlay({
      slug,
      fetch,
      onNewDay,
      onAnswerChanged,
      storage: local,
      ...past,
    }),
    rateLimited: merged === "rate_limited",
  };
}
