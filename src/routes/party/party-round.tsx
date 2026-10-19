// The viewer's own board in a live party round: the guess box, their graded rows (a Blur game's
// image or a Sequence game's photos, and guessed names) and, once they solved it, gave up or ran out of tries, the answer.
import { useState } from "react";
import { Button } from "../../components/ui/button.tsx";
import { Card } from "../../components/ui/card.tsx";
import { findEntryId, SKIP } from "../../game/game.ts";
import type { LiveRound, PartyView } from "../../game/party.ts";
import { GuessForm, useGuessMode } from "../play/guess-form.tsx";
import { SelectList } from "../play/select-list.tsx";
import type { HintKind } from "../../game/free-hint.ts";
import { FreeHintCard } from "../play/free-hint.tsx";
import { AnswerImage, boardOf, PlayResults } from "../play/play-results.tsx";
import { ResultBanner } from "../play/result-banner.tsx";

type Board = NonNullable<LiveRound["yours"]>;

const guesses = (n: number): string => `${n} ${n === 1 ? "guess" : "guesses"}`;

export function PartyRound({
  view,
  round,
  mine,
  onGuess,
  onGiveUp,
  onHint,
  onNotice,
}: {
  view: PartyView;
  round: LiveRound;
  mine: Board;
  // False when the socket is down and the guess was not sent
  onGuess: (entryId: number) => boolean;
  onGiveUp: () => void;
  onHint: (kind: HintKind) => void;
  onNotice: (text: string | null) => void;
}) {
  const [guess, setGuess] = useState("");
  const modes = useGuessMode(view.game.guessMode);
  const done = mine.solved || mine.gaveUp || mine.lost;
  // Selection mode's list, in place of the board
  const listing = modes.selecting && !done;
  const entries = view.game.entries;
  const newestFirst = [...mine.rows].reverse();
  const { tries, wrong, unguessed, names, titles } = boardOf(
    view.game,
    entries,
    mine.rows,
  );

  const submit = (name: string): void => {
    const id = findEntryId(entries, name);
    if (id === null) {
      onNotice("Pick a name from the list.");
      return;
    }
    if (onGuess(id)) {
      onNotice(null);
      setGuess("");
      modes.setSelecting(false);
    }
  };

  return (
    <section id="round" aria-labelledby="round-title">
      <h2 id="round-title" className="mb-3 text-lg font-semibold">
        Round {round.number}
      </h2>
      <div id="result-banner" aria-live="polite">
        {done && mine.answer && (
          <ResultBanner
            result={{
              kind: mine.solved ? "victory" : mine.lost ? "lost" : "give-up",
              answer: mine.answer.name,
              photo: mine.answer.photo || undefined,
              description: mine.answer.description,
            }}
            roster={entries}
            title={
              mine.solved
                ? `Solved in ${guesses(mine.rows.length)}!`
                : mine.lost
                  ? "Out of tries"
                  : "You gave up"
            }
          >
            <span>Waiting for the others to finish.</span>
          </ResultBanner>
        )}
      </div>
      {tries !== null && (
        <AnswerImage
          kind={view.game.kind}
          url={(path, n) =>
            `/api/parties/${encodeURIComponent(view.code)}/${path}/${round.number}/${n}`
          }
          tries={tries}
          wrong={wrong}
          finished={done}
          reveal={done ? mine.answer?.photo : undefined}
        />
      )}
      {!done && (
        <Card id="guess-card" className="play-card mb-6 gap-3 p-4 sm:p-5">
          <GuessForm
            modes={modes}
            names={names}
            value={guess}
            onChange={setGuess}
            onSubmit={submit}
            onSkip={tries === null ? undefined : () => onGuess(SKIP)}
          />
          <div className="game-actions flex justify-end">
            <Button
              id="give-up-button"
              variant="ghost"
              size="sm"
              onClick={onGiveUp}
            >
              Give up
            </Button>
          </div>
        </Card>
      )}
      {/* The hint goes once the answer is revealed */}
      {titles && !done && (
        <FreeHintCard hint={mine.hint} hints={mine.hints} onTake={onHint} />
      )}
      {listing && (
        <SelectList
          entries={unguessed}
          attributes={titles && view.game.attributes}
          onPick={submit}
        />
      )}
      {!listing && (tries !== null || mine.rows.length > 0) && (
        <div id="board">
          <PlayResults
            rows={newestFirst}
            titles={titles}
            loading={false}
            loadingText=""
            empty={false}
          />
        </div>
      )}
    </section>
  );
}
