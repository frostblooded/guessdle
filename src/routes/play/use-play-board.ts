// Play's board session: opens the day's Play once the game and who is signed in are known, and
// keeps the guesses shown, the result, the notice and the Free Hint in step with each guess,
// give-up and reset. The page only draws it and holds the guess box.
import { useEffect, useRef, useState } from "react";
import type { EntryRef, GradedAttribute } from "../../game/game.ts";
import { openPlay } from "../../game/open-play.ts";
import {
  RATE_LIMITED,
  refusalText,
  type GiveUpResult,
  type HintResult,
  type Loaded,
  type Play,
  type SubmitResult,
} from "../../game/play.ts";
import { browserFetch } from "../../lib/api.ts";
import { resultOf, type Result } from "./result-banner.tsx";
import { useFreeHint } from "./use-free-hint.ts";
import { useVictoryStats } from "./use-victory-stats.ts";

const now = (): Date => new Date();

// The banner for a loaded board, null while the day is still being played
const finishedResult = (loaded: Loaded): Result =>
  loaded.answer !== undefined &&
  (loaded.victory || loaded.gaveUp || loaded.lost)
    ? resultOf(
        loaded.victory ? "victory" : loaded.lost ? "lost" : "give-up",
        loaded,
      )
    : null;

// The notice a guess or give-up leaves: why it was refused, or none
const noticeOf = (
  res: SubmitResult | GiveUpResult | HintResult,
): string | null =>
  res.kind === "rate_limited" || res.kind === "error" ? refusalText(res) : null;

export function usePlayBoard({
  slug,
  roster,
  pastDay,
  signedIn,
  canOpen,
}: {
  slug: string;
  roster: readonly EntryRef[];
  // A past day's Day Number; today when absent
  pastDay: number | undefined;
  signedIn: boolean;
  // The game is loaded and playable, and who is signed in is known
  canOpen: boolean;
}) {
  // Newest first, as shown
  const [rows, setRows] = useState<GradedAttribute[][]>([]);
  const [result, setResult] = useState<Result>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [restarted, setRestarted] = useState(false);
  const [ready, setReady] = useState(false);
  const [blocked, setBlocked] = useState(false);
  // Bumped on every fresh board, so a Blur game's board image is fetched again
  const [board, setBoard] = useState(0);
  const play = useRef<Play | null>(null);
  const started = useRef(false);
  const submitting = useRef(false);
  // A past day's first win counts in that day's stats, like today's
  const victory = useVictoryStats(slug, play, pastDay);
  const freeHint = useFreeHint(play, board, (res) => setNotice(noticeOf(res)));
  const adoptHint = freeHint.adopt;

  const clearBoard = (): void => {
    setRows([]);
    setResult(null);
    setBoard((n) => n + 1);
  };

  // Loads the board as stored and shows it: on open, and when a guess or give-up finds the day
  // already over (finished on another device)
  async function showBoard(current: Play): Promise<void> {
    const loaded = await current.load();
    if ("failure" in loaded) {
      setBlocked(true);
      setNotice(loaded.failure);
      return;
    }
    setRows([...loaded.rows].reverse());
    adoptHint(loaded);
    setResult(finishedResult(loaded));
    setReady(true);
  }

  // Picks where the game lives, then loads it. The ref keeps StrictMode's second effect run
  // from merging twice.
  useEffect(() => {
    if (!canOpen || started.current) {
      return;
    }
    started.current = true;
    void (async () => {
      const { play: current, rateLimited } = await openPlay({
        slug,
        roster,
        storage: localStorage,
        signedIn,
        day: pastDay,
        now,
        fetch: browserFetch,
        onNewDay: clearBoard,
        onAnswerChanged: () => setRestarted(true),
      });
      if (rateLimited) {
        setNotice(RATE_LIMITED);
      }
      play.current = current;
      await showBoard(current);
    })();
  }, [canOpen, roster, signedIn, slug, pastDay, adoptHint]);

  // Sends a guess by entry id, or SKIP. True when the guess box should clear: the guess was
  // graded, or was already on the board.
  async function submit(id: number): Promise<boolean> {
    if (submitting.current || !play.current) {
      return false;
    }
    submitting.current = true;
    const res = await play.current.submit(id).finally(() => {
      submitting.current = false;
    });
    setNotice(noticeOf(res));
    if (res.kind === "finished") {
      await showBoard(play.current);
      return false;
    }
    // The typed guess stays when the server could not grade it, to retry
    if (res.kind !== "accepted" && res.kind !== "duplicate") {
      return false;
    }
    if (res.kind === "duplicate") {
      return true;
    }
    if (rows.length === 0) {
      victory.startClock();
    }
    freeHint.offer(res.hints);
    if (res.answer !== undefined && (res.isAnswer || res.lost)) {
      setResult(resultOf(res.isAnswer ? "victory" : "lost", res));
      if (res.isAnswer) {
        void victory.show();
      }
    }
    setRows((old) => [res.row, ...old]);
    return true;
  }

  async function giveUp(): Promise<void> {
    const res = await play.current?.giveUp();
    if (!res) {
      return;
    }
    setNotice(noticeOf(res));
    if (res.kind === "gaveUp") {
      setResult(resultOf("give-up", res));
    } else if (res.kind === "finished" && play.current) {
      await showBoard(play.current);
    }
  }

  async function reset(): Promise<void> {
    if (await play.current?.reset()) {
      clearBoard();
    }
  }

  return {
    rows,
    result,
    notice,
    restarted,
    ready,
    blocked,
    board,
    victory,
    freeHint,
    submit,
    giveUp,
    reset,
  };
}
