// The victory popup's state: the solve clock, and the day's stats fetched when it opens.
import { useState, type RefObject } from "react";
import type { Play } from "../../game/play.ts";
import {
  fetchStats,
  playerToken,
  type DayStats,
  type WinResult,
} from "../../game/stats.ts";
import { browserFetch } from "../../lib/api.ts";

export interface VictoryStats {
  open: boolean;
  setOpen: (open: boolean) => void;
  stats: DayStats | null;
  failed: boolean;
  // The board on screen: its guesses, and its time when the popup opened on the win itself
  thisTry: WinResult | null;
  // Call on a fresh board's first guess
  startClock(): void;
  // Records the win (the first one of the day counts) and opens the popup; `won`: called
  // on the winning guess, not from See stats
  show(won?: boolean): Promise<void>;
}

// `day`: a past day's Day Number; today when absent
export function useVictoryStats(
  slug: string,
  play: RefObject<Play | null>,
  day?: number,
): VictoryStats {
  const [open, setOpen] = useState(false);
  const [stats, setStats] = useState<DayStats | null>(null);
  const [failed, setFailed] = useState(false);
  const [thisTry, setThisTry] = useState<WinResult | null>(null);

  return {
    open,
    setOpen,
    stats,
    failed,
    thisTry,
    startClock(): void {
      play.current?.startClock();
    },
    async show(won: boolean = false): Promise<void> {
      setOpen(true);
      setFailed(false);
      const ids = play.current?.getUsedGuesses() ?? [];
      const time: number | null = play.current?.solveSeconds() ?? null;
      // Only the win itself knows the time; See stats later would count the time since
      setThisTry((old) => ({
        guesses: ids.length,
        seconds: won ? time : old?.guesses === ids.length ? old.seconds : null,
      }));
      const fresh = await fetchStats(
        browserFetch,
        slug,
        {
          ids,
          seconds: time,
          player: playerToken(localStorage),
        },
        day,
      );
      if (fresh) {
        if (fresh.board) {
          setThisTry(fresh.board);
        }
        setStats(fresh);
      } else {
        setFailed(true);
      }
    },
  };
}
