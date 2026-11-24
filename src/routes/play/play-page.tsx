import { useQuery } from "@tanstack/react-query";
import { Flag, RotateCcw } from "lucide-react";
import { useRef, useState, type MouseEvent } from "react";
import { Navigate, useParams } from "react-router";
import { Alert } from "../../components/ui/alert.tsx";
import { Button } from "../../components/ui/button.tsx";
import { Card } from "../../components/ui/card.tsx";
import { FAILURES } from "../../game/failures.ts";
import { findEntryId, SKIP } from "../../game/game.ts";
import { ANSWER_CHANGED } from "../../game/play.ts";
import { MIN_ENTRIES } from "../../game/limits.ts";
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
import { gameStaleTime, loadGame } from "./load-game.ts";
import { GameHead, PlayActions, PlayStatus } from "./play-status.tsx";
import { ResetDialog } from "./reset-dialog.tsx";
import { ResultBanner } from "./result-banner.tsx";
import { SelectList } from "./select-list.tsx";
import { QuizPlay } from "./quiz-play.tsx";
import { StatsDialog } from "./stats-dialog.tsx";
import { usePlayBoard } from "./use-play-board.ts";

function Game({ slug, day }: { slug: string; day: number | null }) {
  const { data: game, isPending } = useQuery({
    queryKey: gameKey(slug),
    queryFn: () => loadGame(slug),
    staleTime: gameStaleTime,
  });
  const me = useMe();

  const [guess, setGuess] = useState("");
  const [confirming, setConfirming] = useState(false);
  const opener = useRef<HTMLButtonElement | null>(null);
  const modes = useGuessMode();

  const playable = typeof game === "object" ? game : null;
  const gameFailure =
    typeof game === "string" && game !== "missing" ? game : null;
  const roster = playable?.entries ?? [];
  const tooSmall = playable !== null && roster.length < MIN_ENTRIES;
  const closed = tooSmall || playable?.paused === true;
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
    if (day === playable.today) {
      return <Navigate replace to={`/g/${encodeURIComponent(slug)}`} />;
    }
    return <NoSuchDay slug={slug} name={playable.name} />;
  }

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
      <GameHead
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
          <PlayActions
            slug={slug}
            pastDays={<PastDaysLink slug={slug} />}
            canHost={playable !== null && !closed}
            canEdit={playable?.canEdit === true}
            saveName={playable && !closed ? playable.name : undefined}
          />
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
            roundActions={
              <>
                <Button
                  id="give-up-button"
                  variant="ghost"
                  size="sm"
                  className="bg-transparent px-2 text-muted-foreground"
                  disabled={cannotPlay || loading}
                  onClick={() => void session.giveUp()}
                >
                  <Flag aria-hidden="true" className="hidden sm:inline" />
                  Give up
                </Button>
                <Button
                  id="reset-guesses-button"
                  variant="ghost"
                  size="sm"
                  className="bg-transparent px-2 text-muted-foreground"
                  disabled={cannotPlay || rows.length === 0}
                  onClick={askReset}
                >
                  <RotateCcw aria-hidden="true" className="hidden sm:inline" />
                  Reset
                </Button>
              </>
            }
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
            thisTry={victory.thisTry}
          />
        )}
        <ResetDialog
          open={confirming}
          onOpenChange={setConfirming}
          onConfirm={() => void session.reset()}
          opener={opener}
          past={past}
        />
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
  const day =
    dayParam === undefined
      ? null
      : /^\d+$/.test(dayParam)
        ? Number(dayParam)
        : Number.NaN;
  return <Game key={`${slug}/${dayParam ?? ""}`} slug={slug} day={day} />;
}
