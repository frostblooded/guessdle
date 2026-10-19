// /g/:slug: play today's game; /g/:slug/day/:day: play or review a past day. Anonymous players keep
// guesses in the browser, signed-in ones on the server.
import { useQuery } from "@tanstack/react-query";
import { useRef, useState, type MouseEvent } from "react";
import { Navigate, useParams } from "react-router";
import { PageHead } from "../../components/page.tsx";
import { Alert } from "../../components/ui/alert.tsx";
import { Button } from "../../components/ui/button.tsx";
import { Card } from "../../components/ui/card.tsx";
import { FAILURES } from "../../game/failures.ts";
import { findEntryId, SKIP } from "../../game/game.ts";
import { ANSWER_CHANGED } from "../../game/play.ts";
import { minEntriesOf } from "../../game/blur.ts";
import { gameKey, useMe } from "../../lib/api.ts";
import { useTitle } from "../../lib/use-title.ts";
import { FreeHintCard } from "./free-hint.tsx";
import { GuessForm, useGuessMode } from "./guess-form.tsx";
import {
  GameNotFound,
  NoSuchDay,
  PastDayLede,
  PastDaysLink,
} from "./past-day.tsx";
import {
  AnswerImage,
  answerImageUrl,
  boardOf,
  PlayResults,
} from "./play-results.tsx";
import { loadGame } from "./load-game.ts";
import { PlayActions, PlayStatus } from "./play-status.tsx";
import { ResetDialog } from "./reset-dialog.tsx";
import { ResultBanner } from "./result-banner.tsx";
import { SelectList } from "./select-list.tsx";
import { QuizPlay } from "./quiz-play.tsx";
import { StatsDialog } from "./stats-dialog.tsx";
import { usePlayBoard } from "./use-play-board.ts";

// `day`: a past day's Day Number from the address, or null for today
function Game({ slug, day }: { slug: string; day: number | null }) {
  const { data: game, isPending } = useQuery({
    queryKey: gameKey(slug),
    queryFn: () => loadGame(slug),
    staleTime: Infinity,
  });
  const me = useMe();

  const [guess, setGuess] = useState("");
  const [confirming, setConfirming] = useState(false);
  const opener = useRef<HTMLButtonElement | null>(null);
  const modes = useGuessMode();

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
  const {
    rows,
    result,
    notice,
    restarted,
    ready,
    blocked,
    board,
    victory,
    freeHint,
    ...session
  } = usePlayBoard({
    slug,
    roster,
    pastDay,
    signedIn: me.data !== null && me.data !== undefined,
    canOpen:
      playable !== null &&
      !closed &&
      !me.isPending &&
      (day === null || pastDay !== undefined),
  });

  useTitle(
    game === "missing"
      ? "Game not found - Guessdle"
      : playable
        ? `${playable.name} - Guessdle`
        : "Guessdle",
  );

  // Sends a guess by entry id, or SKIP; a graded one clears the guess box
  async function submitId(id: number): Promise<void> {
    if (await session.submit(id)) {
      if (id !== SKIP) {
        setGuess("");
      }
    }
  }

  async function submit(name: string): Promise<void> {
    const id = findEntryId(roster, name);
    if (id !== null) {
      await submitId(id);
    }
  }

  const askReset = (event: MouseEvent<HTMLButtonElement>): void => {
    opener.current = event.currentTarget;
    setConfirming(true);
  };

  if (game === "missing") {
    return <GameNotFound />;
  }
  if (playable?.kind === "quiz") {
    return <QuizPlay slug={slug} game={playable} day={day} />;
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
          : (notice ?? (restarted ? ANSWER_CHANGED : null));
  const loading = !cannotPlay && !ready;
  const finished = result !== null;
  const { tries, wrong, unguessed, names, titles } = boardOf(
    playable ?? { kind: "classic", attributes: [] },
    roster,
    rows,
  );

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
              onClick={() => void session.giveUp()}
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
              saveName={playable && !closed ? playable.name : undefined}
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
        {tries !== null && ready && playable && (
          <AnswerImage
            kind={playable.kind}
            url={(path, n) => answerImageUrl(path, slug, n, board, pastDay)}
            tries={tries}
            wrong={wrong}
            finished={finished}
            reveal={result?.photo}
          />
        )}
        <Card className="play-card mb-6 flex flex-col gap-4 p-4 sm:p-5">
          <GuessForm
            modes={modes}
            names={names}
            value={guess}
            onChange={setGuess}
            onSubmit={(name) => void submit(name)}
            onSkip={tries === null ? undefined : () => void submitId(SKIP)}
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
          onConfirm={() => void session.reset()}
          opener={opener}
          past={past}
        />
        {/* The hint goes once the answer is revealed */}
        {titles && !finished && (
          <FreeHintCard
            {...freeHint}
            hints={cannotPlay ? undefined : freeHint.hints}
            onTake={(kind) => void freeHint.take(kind)}
          />
        )}
        {modes.selecting && !finished && !cannotPlay && (
          <SelectList
            entries={unguessed}
            onPick={(name) => void submit(name)}
          />
        )}
        <PlayResults
          rows={rows}
          titles={titles}
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
