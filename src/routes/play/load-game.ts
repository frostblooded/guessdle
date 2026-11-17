import { browserFetch } from "../../lib/api.ts";
import { failureText, UNREACHABLE } from "../../game/failures.ts";
import type { GameKind } from "../../game/blur.ts";
import type { EntryRef, GameAttribute } from "../../game/game.ts";
import type { StatusView } from "./play-status.tsx";
import type { QuizQuestion } from "../../game/quiz.ts";

export type PlayableGame = {
  name: string;
  today: number;
  startDate: string;
  canEdit: boolean;
  paused: boolean;
  kind: GameKind;
  blurTries?: number;
  attributes: GameAttribute[];
  entries: EntryRef[];
  questions?: QuizQuestion[];
} & StatusView;

export async function loadJson<T>(
  path: string,
): Promise<T | "missing" | string> {
  try {
    const res = await browserFetch(path);
    if (res.status === 404) {
      return "missing";
    }
    const data = (await res.json().catch(() => null)) as unknown;
    return res.ok
      ? (data as T)
      : failureText((data as { error?: unknown } | null)?.error, res.status);
  } catch {
    return UNREACHABLE;
  }
}

export const loadGame = (slug: string) =>
  loadJson<PlayableGame>(`/api/games/${encodeURIComponent(slug)}`);

export const gameStaleTime = ({
  state,
}: {
  state: { data?: unknown };
}): number => (typeof state.data === "object" ? Infinity : 0);
