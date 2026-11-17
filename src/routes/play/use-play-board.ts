import { endingOf } from "../../game/board.ts";
import { useRef, useState } from "react";
import { useOnce } from "../../lib/effects.ts";
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

const finishedResult = (loaded: Loaded): Result => {
  const ending = endingOf({ won: loaded.victory, ...loaded });
  return loaded.answer !== undefined && ending
    ? resultOf(ending, loaded)
    : null;
};

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
  pastDay: number | undefined;
  signedIn: boolean;
  canOpen: boolean;
}) {
  const [rows, setRows] = useState<GradedAttribute[][]>([]);
  const [result, setResult] = useState<Result>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [restarted, setRestarted] = useState(false);
  const [ready, setReady] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [board, setBoard] = useState(0);
  const play = useRef<Play | null>(null);
  const submitting = useRef(false);
  const victory = useVictoryStats(slug, play, pastDay);
  const freeHint = useFreeHint(play, board, (res) => setNotice(noticeOf(res)));
  const adoptHint = freeHint.adopt;

  const clearBoard = (): void => {
    setRows([]);
    setResult(null);
    setBoard((n) => n + 1);
  };

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

  useOnce(canOpen, () => {
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
  });

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
    if (res.kind !== "accepted" && res.kind !== "duplicate") {
      return false;
    }
    if (res.kind === "duplicate") {
      return true;
    }
    if (play.current.getUsedGuesses().length === 1) {
      victory.startClock();
    }
    freeHint.offer(res.hints);
    if (res.answer !== undefined && (res.isAnswer || res.lost)) {
      setResult(resultOf(res.isAnswer ? "victory" : "lost", res));
      if (res.isAnswer) {
        void victory.show(true);
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
