// The game Play and Past Days show: its attributes and entries, loaded from the API
import { failureText, UNREACHABLE } from "../../game/failures.ts";
import type { EntryRef, GameAttribute } from "../../game/game.ts";
import type { GameKind } from "../../game/blur.ts";
import type { StatusView } from "./play-status.tsx";

export type PlayableGame = {
  name: string;
  // Today's Day Number; past days are 0 up to it
  today: number;
  // Day 0's date, "YYYY-MM-DD"
  startDate: string;
  canEdit: boolean;
  // Some entries miss values, so the game cannot be played for now
  paused: boolean;
  kind: GameKind;
  // Blur games: tries per day
  blurTries?: number;
  attributes: GameAttribute[];
  // A Blur game's entries come without photos
  entries: EntryRef[];
} & StatusView;

// The game's attributes and entries, "missing" for no such game, or the text of why it could not be loaded
export async function loadGame(
  slug: string,
): Promise<PlayableGame | "missing" | string> {
  try {
    const res = await fetch(`/api/games/${encodeURIComponent(slug)}`);
    if (res.status === 404) {
      return "missing";
    }
    const data = (await res.json().catch(() => null)) as unknown;
    return res.ok
      ? (data as PlayableGame)
      : failureText((data as { error?: unknown } | null)?.error, res.status);
  } catch {
    return UNREACHABLE;
  }
}
