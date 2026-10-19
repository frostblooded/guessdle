// The victory popup's state: the solve clock, and the day's stats fetched when it opens.
import { useState, type RefObject } from "react";
import { gameStorage, pastDayStorage } from "../../game/game-state.ts";
import type { Play } from "../../game/play.ts";
import { fetchStats, playerToken, type DayStats } from "../../game/stats.ts";
import { browserFetch } from "../../lib/api.ts";

// When the current board's first guess was made on this browser: [Day Number, ms since the epoch]
const FIRST_GUESS_KEY = "firstGuessAt";

export interface VictoryStats {
  open: boolean;
  setOpen: (open: boolean) => void;
  stats: DayStats | null;
  failed: boolean;
  // Call on a fresh board's first guess
  startClock(): void;
  // Records the win (the first one of the day counts) and opens the popup
  show(): Promise<void>;
}

// `day`: a past day's Day Number; today when absent
export function useVictoryStats(
  slug: string,
  play: RefObject<Play | null>,
  day?: number,
): VictoryStats {
  // The clock lives with the board it times
  const board = (): ReturnType<typeof gameStorage> =>
    day === undefined
      ? gameStorage(localStorage, slug)
      : pastDayStorage(localStorage, slug, day);
  const [open, setOpen] = useState(false);
  const [stats, setStats] = useState<DayStats | null>(null);
  const [failed, setFailed] = useState(false);

  // Whole seconds since the first guess, or null when this browser did not see this day's
  const seconds = (): number | null => {
    try {
      const [day, started]: unknown[] = JSON.parse(
        board().getItem(FIRST_GUESS_KEY) ?? "[]",
      ) as unknown[];
      return day === play.current?.getDay() && Number(started) > 0
        ? Math.max(0, Math.round((Date.now() - Number(started)) / 1000))
        : null;
    } catch {
      return null;
    }
  };

  return {
    open,
    setOpen,
    stats,
    failed,
    startClock(): void {
      try {
        board().setItem(
          FIRST_GUESS_KEY,
          JSON.stringify([play.current?.getDay() ?? null, Date.now()]),
        );
      } catch {
        // Blocked storage: the time stays unknown
      }
    },
    async show(): Promise<void> {
      setOpen(true);
      setFailed(false);
      const fresh = await fetchStats(
        browserFetch,
        slug,
        {
          ids: play.current?.getUsedGuesses() ?? [],
          seconds: seconds(),
          player: playerToken(localStorage),
        },
        day,
      );
      if (fresh) {
        setStats(fresh);
      } else {
        setFailed(true);
      }
    },
  };
}
