// /g/:slug: play today's game. Anonymous players keep guesses in the browser, signed-in ones on the server.
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { Link, useParams } from "react-router";
import { ZoomView } from "../../components/zoom-view.tsx";
import { MessageCard, PageHead } from "../../components/page.tsx";
import { Alert } from "../../components/ui/alert.tsx";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "../../components/ui/alert-dialog.tsx";
import { Button, buttonVariants } from "../../components/ui/button.tsx";
import { Card } from "../../components/ui/card.tsx";
import { FAILURES } from "../../game/failures.ts";
import {
  findEntryId,
  isAnswerRow,
  nameCell,
  type EntryRef,
  type GameAttribute,
  type GradedAttribute,
} from "../../game/game.ts";
import { gameStorage } from "../../game/game-state.ts";
import { MIN_ENTRIES } from "../../game/limits.ts";
import { mergeLocalGame } from "../../game/merge.ts";
import { createPlay, type Play, type Reveal } from "../../game/play.ts";
import type { GameKind } from "../../game/zoom.ts";
import { createServerPlay } from "../../game/server-play.ts";
import { browserFetch, useMe } from "../../lib/api.ts";
import { useTitle } from "../../lib/use-title.ts";
import { GuessBox } from "./guess-box.tsx";
import { PlayResults } from "./play-results.tsx";
import { PlayActions, PlayStatus, type StatusView } from "./play-status.tsx";
import { ResultBanner, type Result } from "./result-banner.tsx";

type PlayableGame = {
  name: string;
  canEdit: boolean;
  // Some entries miss values, so the game cannot be played for now
  paused: boolean;
  kind: GameKind;
  // Zoom games: parts per day, one try each
  zoomParts?: number;
  attributes: GameAttribute[];
  // A Zoom game's entries come without photos
  entries: EntryRef[];
} & StatusView;

// The game's attributes and entries, "missing" for no such game, or null when it could not be loaded
async function loadGame(
  slug: string,
): Promise<PlayableGame | "missing" | null> {
  try {
    const res = await fetch(`/api/games/${encodeURIComponent(slug)}`);
    if (res.status === 404) {
      return "missing";
    }
    return res.ok ? ((await res.json()) as PlayableGame) : null;
  } catch {
    return null;
  }
}

const now = (): Date => new Date();

export const RATE_LIMITED =
  "Too many requests in a short time. Wait a minute, then try again.";
const GUESS_FAILED =
  "Your guess could not be checked because the server did not answer. It is still in the box: press Enter to try again.";
const GIVE_UP_FAILED =
  "Could not reveal the answer because the server did not answer. Try again in a moment.";
const GAME_FAILED =
  "Could not load the game. Your connection may be down or the server may have a problem. Refresh the page; if it keeps failing, try again in a few minutes.";
const STATE_FAILED =
  "Could not load your game. Your connection may be down or the server may have a problem. Refresh the page; if it keeps failing, try again in a few minutes.";

function Game({ slug }: { slug: string }) {
  const { data: game, isPending } = useQuery({
    queryKey: ["game", slug],
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
  // Bumped on every fresh board, so a Zoom game's part images are fetched again
  const [board, setBoard] = useState(0);
  const play = useRef<Play | null>(null);
  const started = useRef(false);
  const submitting = useRef(false);
  const opener = useRef<HTMLButtonElement | null>(null);

  const playable = typeof game === "object" && game !== null ? game : null;
  const roster = playable?.entries ?? [];
  const tooSmall = playable !== null && roster.length < MIN_ENTRIES;
  // Not playable for now: too few entries, or paused
  const closed = tooSmall || playable?.paused === true;

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

  const resultOf = (
    kind: NonNullable<Result>["kind"],
    reveal: Reveal,
  ): Result => ({ kind, answer: reveal.answer!, photo: reveal.answerPhoto });

  // Once the game and who is signed in are known: pick where the game lives, then load it.
  // The ref keeps StrictMode's second effect run from merging twice.
  useEffect(() => {
    if (!playable || closed || me.isPending || started.current) {
      return;
    }
    started.current = true;
    const storage = gameStorage(localStorage, slug);
    void (async () => {
      let current: Play = createPlay({
        slug,
        roster: playable.entries,
        storage,
        now,
        fetch: browserFetch,
        onNewDay: clearBoard,
      });
      if (me.data) {
        const merged = await mergeLocalGame(slug, storage, now, browserFetch);
        if (merged === "rate_limited") {
          setNotice(RATE_LIMITED);
        }
        current = createServerPlay({
          slug,
          fetch: browserFetch,
          onNewDay: clearBoard,
        });
      }
      play.current = current;
      const loaded = await current.load();
      if (loaded === null) {
        setBlocked(true);
        setNotice(STATE_FAILED);
        return;
      }
      setRows([...loaded.rows].reverse());
      if (
        loaded.answer !== undefined &&
        (loaded.victory || loaded.gaveUp || loaded.lost)
      ) {
        setResult(
          resultOf(
            loaded.victory ? "victory" : loaded.lost ? "lost" : "give-up",
            loaded,
          ),
        );
      }
      setReady(true);
    })();
  }, [playable, closed, me.isPending, me.data, slug]);

  async function submit(name: string): Promise<void> {
    const id = findEntryId(roster, name);
    if (id === null || submitting.current || !play.current) {
      return;
    }
    submitting.current = true;
    const res = await play.current.submit(id).finally(() => {
      submitting.current = false;
    });
    setNotice(
      res.kind === "rate_limited"
        ? RATE_LIMITED
        : res.kind === "error"
          ? GUESS_FAILED
          : null,
    );
    // The typed guess stays when the server could not grade it, to retry
    if (res.kind !== "accepted" && res.kind !== "duplicate") {
      return;
    }
    setGuess("");
    if (res.kind === "duplicate") {
      return;
    }
    if (res.answer !== undefined && (res.isAnswer || res.lost)) {
      setResult(resultOf(res.isAnswer ? "victory" : "lost", res));
    }
    setRows((old) => [res.row, ...old]);
  }

  async function giveUp(): Promise<void> {
    const res = await play.current?.giveUp();
    if (!res) {
      return;
    }
    setNotice(
      res.kind === "rate_limited"
        ? RATE_LIMITED
        : res.kind === "error"
          ? GIVE_UP_FAILED
          : null,
    );
    if (res.kind === "gaveUp") {
      setResult(resultOf("give-up", res));
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
    return (
      <>
        <PageHead
          titleId="game-title"
          title="Game not found"
          lede={<p id="game-lede">There is no game at this address.</p>}
        />
        <MessageCard id="not-found">
          <Link className={buttonVariants()} to="/">
            See all games
          </Link>
        </MessageCard>
      </>
    );
  }

  // The game cannot be played on this page view: the reason shows as the notice
  const cannotPlay = game === null || closed || blocked;
  const shownNotice =
    game === null
      ? GAME_FAILED
      : tooSmall
        ? `${FAILURES.not_enough_entries.text} It has ${roster.length} now.`
        : closed
          ? FAILURES.game_paused.text
          : notice;
  const loading = !cannotPlay && !ready;
  const finished = result !== null;
  // Each row names its guess; those names leave the suggestions
  const used = new Set(rows.map((row) => nameCell(row).value));
  const zoom = playable?.kind === "zoom" ? (playable.zoomParts ?? 1) : null;
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
        {zoom !== null && ready && (
          <div className="mb-6">
            <ZoomView
              partUrl={(n) =>
                `/api/games/${encodeURIComponent(slug)}/zoom/${n}?b=${board}`
              }
              tries={zoom}
              wrong={wrong}
              finished={finished}
              reveal={result?.photo}
            />
          </div>
        )}
        <Card className="play-card mb-6 gap-3 p-4 sm:p-5">
          <div
            id="new-guess-row"
            className="guess-row flex gap-2"
            hidden={finished}
          >
            <GuessBox
              names={names}
              value={guess}
              onChange={setGuess}
              onSubmit={(name) => void submit(name)}
              disabled={cannotPlay}
            />
            <Button
              id="submit-new-guess-button"
              className="h-11 px-5 font-bold uppercase"
              disabled={cannotPlay || loading}
              onClick={() => void submit(guess)}
            >
              Guess
            </Button>
          </div>
          <div className="game-actions flex justify-center" hidden={!finished}>
            <Button
              id="reset-button"
              hidden={!finished}
              disabled={cannotPlay}
              onClick={askReset}
            >
              Reset today&apos;s game
            </Button>
          </div>
        </Card>
        <AlertDialog open={confirming} onOpenChange={setConfirming}>
          <AlertDialogContent
            id="reset-dialog"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              opener.current?.focus();
            }}
          >
            <AlertDialogTitle>Reset today&apos;s guesses?</AlertDialogTitle>
            <AlertDialogDescription>
              The Daily Answer stays the same; you start with a fresh board.
            </AlertDialogDescription>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction value="confirm" onClick={() => void reset()}>
                Reset
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <PlayResults
          rows={rows}
          titles={zoom === null ? titles : null}
          loading={isPending || loading}
          empty={ready && rows.length === 0}
        />
      </section>
    </>
  );
}

export function PlayPage() {
  const { slug = "" } = useParams();
  // A new game is a fresh board: no state carries over from the last one
  return <Game key={slug} slug={slug} />;
}
