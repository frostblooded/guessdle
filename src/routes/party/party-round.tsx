// The viewer's own board in a live party round: the guess box, their graded rows (a Blur game's
// image and guessed names) and, once they solved it, gave up or ran out of tries, the answer.
import { useState } from "react";
import { GuessRow, TitleRow } from "../../components/board.tsx";
import { BlurGuesses, BlurView } from "../../components/blur-view.tsx";
import { Button } from "../../components/ui/button.tsx";
import { Card } from "../../components/ui/card.tsx";
import {
  boardColumns,
  findEntryId,
  guessedNames,
  isAnswerRow,
  SKIP,
} from "../../game/game.ts";
import type { LiveRound, PartyView } from "../../game/party.ts";
import { GuessForm, useGuessMode } from "../play/guess-form.tsx";
import { SelectList } from "../play/select-list.tsx";

type Board = NonNullable<LiveRound["yours"]>;

export function PartyRound({
  view,
  round,
  mine,
  onGuess,
  onGiveUp,
  onNotice,
}: {
  view: PartyView;
  round: LiveRound;
  mine: Board;
  // False when the socket is down and the guess was not sent
  onGuess: (entryId: number) => boolean;
  onGiveUp: () => void;
  onNotice: (text: string | null) => void;
}) {
  const [guess, setGuess] = useState("");
  const modes = useGuessMode();
  const done = mine.solved || mine.gaveUp || mine.lost;
  // Selection mode's list, in place of the board
  const listing = modes.selecting && !done;
  const entries = view.game.entries;
  const used = guessedNames(mine.rows);
  const blur = view.game.kind === "blur" ? (view.game.blurTries ?? 1) : null;
  const newestFirst = [...mine.rows].reverse();
  const unguessed = entries.filter((e) => !used.has(e.name));
  const names = unguessed.map((e) => e.name);
  const titles = boardColumns(view.game.attributes);

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
          <div
            className={`banner banner-${mine.solved ? "victory" : "give-up"} animate-in mb-6 flex items-center gap-4 rounded-xl border p-4 shadow-sm ${
              mine.solved
                ? "bg-success-bg text-success"
                : "bg-card text-foreground"
            }`}
          >
            {mine.answer.photo && (
              <img
                className="size-16 shrink-0 rounded-lg object-cover"
                src={mine.answer.photo}
                alt=""
              />
            )}
            <div className="flex min-w-0 flex-col gap-1">
              <strong className="text-xl font-bold">
                {mine.solved
                  ? `Solved in ${mine.rows.length} ${mine.rows.length === 1 ? "guess" : "guesses"}!`
                  : mine.lost
                    ? "Out of tries"
                    : "You gave up"}
              </strong>
              <span className="break-words">
                The answer is {mine.answer.name}. Waiting for the others to
                finish.
              </span>
            </div>
          </div>
        )}
      </div>
      {blur !== null && (
        <BlurView
          boardUrl={(n) =>
            `/api/parties/${encodeURIComponent(view.code)}/blur/${round.number}/${n}`
          }
          tries={blur}
          wrong={mine.rows.filter((row) => !isAnswerRow(row)).length}
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
            onSkip={blur === null ? undefined : () => onGuess(SKIP)}
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
      {listing && (
        <SelectList
          entries={unguessed}
          attributes={blur === null ? view.game.attributes : null}
          onPick={submit}
        />
      )}
      {!listing && blur !== null && <BlurGuesses rows={newestFirst} />}
      {!listing && blur === null && mine.rows.length > 0 && (
        <div id="board" className="results flex flex-col gap-2 sm:gap-2.5">
          <TitleRow columns={titles} />
          <div id="guess-results-container" className="flex flex-col gap-2">
            {newestFirst.map((row, i) => (
              <GuessRow key={mine.rows.length - i} row={row} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
