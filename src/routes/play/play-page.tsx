// /g/:slug: play today's game; /g/:slug/day/:day: play or review a past day. Anonymous players keep
// guesses in the browser, signed-in ones on the server.
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { Navigate, useParams } from "react-router";
import { BlurView } from "../../components/blur-view.tsx";
import { PageHead } from "../../components/page.tsx";
import { Alert } from "../../components/ui/alert.tsx";
import { Button } from "../../components/ui/button.tsx";
import { Card } from "../../components/ui/card.tsx";
import { FAILURES, failureText, UNREACHABLE } from "../../game/failures.ts";
import {
  findEntryId,
  guessedNames,
  SKIP,
  isAnswerRow,
  type EntryRef,
  type GameAttribute,
  type GradedAttribute,
} from "../../game/game.ts";
import { openPlay } from "../../game/open-play.ts";
import {
  RATE_LIMITED,
  refusalText,
  type GiveUpResult,
  type Loaded,
  type Play,
  type SubmitResult,
} from "../../game/play.ts";
import { minEntriesOf, type GameKind } from "../../game/blur.ts";
import { browserFetch, gameKey, useMe } from "../../lib/api.ts";
import { useTitle } from "../../lib/use-title.ts";
import { GuessForm } from "./guess-form.tsx";
import {
  GameNotFound,
  NoSuchDay,
  PastDayLede,
  PastDaysLink,
} from "./past-day.tsx";
import { boardUrl, PlayResults } from "./play-results.tsx";
import { PlayActions, PlayStatus, type StatusView } from "./play-status.tsx";
import { ResetDialog } from "./reset-dialog.tsx";
import { ResultBanner, resultOf, type Result } from "./result-banner.tsx";
import { StatsDialog } from "./stats-dialog.tsx";
import { useVictoryStats } from "./use-victory-stats.ts";

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
const noticeOf = (res: SubmitResult | GiveUpResult): string | null =>
  res.kind === "rate_limited" || res.kind === "error" ? refusalText(res) : null;

// `day`: a past day's Day Number from the address, or null for today
function Game({ slug, day }: { slug: string; day: number | null }) {
  const { data: game, isPending } = useQuery({
    queryKey: gameKey(slug),
    queryFn: () => loadGame(slug),
    staleTime: Infinity,
  });
  const me = useMe();

  // Newest first, as shown
  const [rows, setRows] = useState<GradedAttribute[][]>([]);
  const [result, setResult] = useState<Result>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [guess, setGuess] = useState("");
  const [confirming, setConfirming] = useState(false);
  // Bumped on every fresh board, so a Blur game's board image is fetched again
  const [board, setBoard] = useState(0);
  const play = useRef<Play | null>(null);
  const started = useRef(false);
  const submitting = useRef(false);
  const opener = useRef<HTMLButtonElement | null>(null);

  const playable = typeof game === "object" ? game : null;
  // Why the game could not be loaded
  const gameFailure =
    typeof game === "string" && game !== "missing" ? game : null;
  const roster = playable?.entries ?? [];
  const tooSmall =
    playable !== null && roster.length < minEntriesOf(playable.kind);
  // Not playable for now: too few entries, or paused
  const closed = tooSmall || playable?.paused === true;
  // A past day the game has; today's and later Day Numbers are handled below
  const past = playable !== null && day !== null && day < playable.today;
  const pastDay = past ? day : undefined;
  // A past day's first win counts in that day's stats, like today's
  const victory = useVictoryStats(slug, play, pastDay);

  useTitle(
    game === "missing"
      ? "Game not found - Guessdle"
      : playable
        ? `${playable.name} - Guessdle`
        : "Guessdle",
  );

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
    setResult(finishedResult(loaded));
    setReady(true);
  }

  // Once the game and who is signed in are known: pick where the game lives, then load it.
  // The ref keeps StrictMode's second effect run from merging twice.
  useEffect(() => {
    if (
      !playable ||
      closed ||
      me.isPending ||
      started.current ||
      (day !== null && pastDay === undefined)
    ) {
      return;
    }
    started.current = true;
    void (async () => {
      const { play: current, rateLimited } = await openPlay({
        slug,
        roster: playable.entries,
        storage: localStorage,
        signedIn: me.data !== null && me.data !== undefined,
        day: pastDay,
        now,
        fetch: browserFetch,
        onNewDay: clearBoard,
      });
      if (rateLimited) {
        setNotice(RATE_LIMITED);
      }
      play.current = current;
      await showBoard(current);
    })();
  }, [playable, closed, me.isPending, me.data, slug, day, pastDay]);

  async function submit(name: string): Promise<void> {
    const id = findEntryId(roster, name);
    if (id !== null) {
      await submitId(id);
    }
  }

  // Sends a guess by entry id, or SKIP
  async function submitId(id: number): Promise<void> {
    if (submitting.current || !play.current) {
      return;
    }
    submitting.current = true;
    const res = await play.current.submit(id).finally(() => {
      submitting.current = false;
    });
    setNotice(noticeOf(res));
    if (res.kind === "finished") {
      await showBoard(play.current);
      return;
    }
    // The typed guess stays when the server could not grade it, to retry, and on a skip
    if (res.kind !== "accepted" && res.kind !== "duplicate") {
      return;
    }
    if (id !== SKIP) {
      setGuess("");
    }
    if (res.kind === "duplicate") {
      return;
    }
    if (rows.length === 0) {
      victory.startClock();
    }
    if (res.answer !== undefined && (res.isAnswer || res.lost)) {
      setResult(resultOf(res.isAnswer ? "victory" : "lost", res));
      if (res.isAnswer) {
        void victory.show();
      }
    }
    setRows((old) => [res.row, ...old]);
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

  const askReset = (event: MouseEvent<HTMLButtonElement>): void => {
    opener.current = event.currentTarget;
    setConfirming(true);
  };

  if (game === "missing") {
    return <GameNotFound />;
  }

  if (playable && day !== null && !past) {
    // Today's Day Number is the game's own page; a later one does not exist yet
    if (day === playable.today) {
      return <Navigate replace to={`/g/${encodeURIComponent(slug)}`} />;
    }
    return <NoSuchDay slug={slug} name={playable.name} />;
  }

  // The game cannot be played on this page view: the reason shows as the notice
  const cannotPlay = gameFailure !== null || closed || blocked;
  const shownNotice =
    gameFailure !== null
      ? gameFailure
      : tooSmall
        ? `${FAILURES.not_enough_entries.text} It has ${roster.length} now.`
        : closed
          ? FAILURES.game_paused.text
          : notice;
  const loading = !cannotPlay && !ready;
  const finished = result !== null;
  // Each row names its guess; those names leave the suggestions
  const used = guessedNames(rows);
  const blur = playable?.kind === "blur" ? (playable.blurTries ?? 1) : null;
  const wrong = rows.filter((row) => !isAnswerRow(row)).length;
  const names = roster
    .map((entry) => entry.name)
    .filter((name) => !used.has(name));
  const titles = [
    "Photo",
    "Name",
    ...(playable?.attributes.map((a) => a.name) ?? []),
  ];

  return (
    <>
      <PageHead
        centered
        titleId="game-title"
        title={playable?.name ?? "Guess today's answer"}
        lede={
          playable &&
          pastDay !== undefined && (
            <PastDayLede
              slug={slug}
              day={pastDay}
              startDate={playable.startDate}
            />
          )
        }
        actions={
          <>
            {/* Up here, well away from Guess, so a slightly-off tap cannot hit them */}
            <Button
              id="give-up-button"
              variant="outline"
              size="sm"
              hidden={finished}
              disabled={cannotPlay || loading}
              onClick={() => void giveUp()}
            >
              Give up
            </Button>
            <Button
              id="reset-guesses-button"
              variant="outline"
              size="sm"
              hidden={finished}
              disabled={cannotPlay || rows.length === 0}
              onClick={askReset}
            >
              Reset
            </Button>
            <PastDaysLink slug={slug} />
            <PlayActions
              slug={slug}
              canHost={playable !== null && !closed}
              canEdit={playable?.canEdit === true}
            />
          </>
        }
      />
      {playable && <PlayStatus slug={slug} view={playable} />}
      <Alert id="notice" variant="warn" role="status" className="mb-4">
        {shownNotice}
      </Alert>
      <div id="result-banner" aria-live="polite">
        {result && <ResultBanner result={result} roster={roster} />}
      </div>
      <section
        id="board"
        aria-label="Game board"
        aria-busy={isPending || loading ? true : undefined}
      >
        {blur !== null && ready && (
          <BlurView
            boardUrl={(n) => boardUrl(slug, n, board, pastDay)}
            tries={blur}
            wrong={wrong}
            finished={finished}
            reveal={result?.photo}
          />
        )}
        <Card className="play-card mb-6 gap-3 p-4 sm:p-5">
          <GuessForm
            names={names}
            value={guess}
            onChange={setGuess}
            onSubmit={(name) => void submit(name)}
            onSkip={blur === null ? undefined : () => void submitId(SKIP)}
            disabled={cannotPlay}
            busy={loading}
            hidden={finished}
          />
          <div
            className="game-actions flex flex-wrap justify-center gap-2"
            hidden={!finished}
          >
            <Button
              id="stats-button"
              variant="outline"
              hidden={result?.kind !== "victory"}
              onClick={() => void victory.show()}
            >
              See stats
            </Button>
            <Button
              id="reset-button"
              hidden={!finished}
              disabled={cannotPlay}
              onClick={askReset}
            >
              {past ? "Reset this game" : "Reset today's game"}
            </Button>
          </div>
        </Card>
        {result?.kind === "victory" && (
          <StatsDialog
            past={past}
            open={victory.open}
            onOpenChange={victory.setOpen}
            answer={result.answer}
            stats={victory.stats}
            failed={victory.failed}
            returnFocusId="stats-button"
          />
        )}
        <ResetDialog
          open={confirming}
          onOpenChange={setConfirming}
          onConfirm={() => void reset()}
          opener={opener}
          past={past}
        />
        <PlayResults
          rows={rows}
          titles={blur === null ? titles : null}
          loading={isPending || loading}
          loadingText={past ? "Loading the game…" : "Loading today's game…"}
          empty={ready && rows.length === 0}
        />
      </section>
    </>
  );
}

export function PlayPage() {
  const { slug = "", day: dayParam } = useParams();
  // Anything but digits (NaN) or a day after today shows the no-such-day card
  const day =
    dayParam === undefined
      ? null
      : /^\d+$/.test(dayParam)
        ? Number(dayParam)
        : Number.NaN;
  // A new game or day is a fresh board: no state carries over from the last one
  return <Game key={`${slug}/${dayParam ?? ""}`} slug={slug} day={day} />;
}
