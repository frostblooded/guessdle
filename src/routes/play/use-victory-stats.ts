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
  thisTry: WinResult | null;
  startClock(): void;
  show(won?: boolean): Promise<void>;
}

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
