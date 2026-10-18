// The viewer's own board in a live party round: the guess box, their graded rows (a Blur game's
// image and guessed names) and, once they solved it, gave up or ran out of tries, the answer.
import { useState } from "react";
import { BoardRow, GuessRow, TitleTile } from "../../components/board.tsx";
import { BlurGuesses, BlurView } from "../../components/blur-view.tsx";
import { Button } from "../../components/ui/button.tsx";
import { Card } from "../../components/ui/card.tsx";
import { findEntryId, isAnswerRow, nameCell } from "../../game/game.ts";
import type { HintKind } from "../../game/free-hint.ts";
import type { LiveRound, PartyView } from "../../game/party.ts";
import { FreeHintCard } from "../play/free-hint.tsx";
import { GuessBox } from "../play/guess-box.tsx";
import { AnswerDescription } from "../play/result-banner.tsx";

type Board = NonNullable<LiveRound["yours"]>;

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
  const entries = view.game.entries;
  const done = mine.solved || mine.gaveUp || mine.lost;
  const used = new Set(mine.rows.map((row) => nameCell(row).value));
  const blur = view.game.kind === "blur" ? (view.game.blurTries ?? 1) : null;
  const newestFirst = [...mine.rows].reverse();
  const names = entries.map((e) => e.name).filter((name) => !used.has(name));
  const titles = ["Photo", "Name", ...view.game.attributes.map((a) => a.name)];

  const submit = (name: string): void => {
    const id = findEntryId(entries, name);
    if (id === null) {
      onNotice("Pick a name from the list.");
      return;
    }
    if (onGuess(id)) {
      onNotice(null);
      setGuess("");
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
              {mine.answer.description && (
                <AnswerDescription text={mine.answer.description} />
              )}
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
          <div id="new-guess-row" className="guess-row flex gap-2">
            <GuessBox
              names={names}
              value={guess}
              onChange={setGuess}
              onSubmit={submit}
              disabled={false}
            />
            <Button
              id="submit-new-guess-button"
              className="h-11"
              onClick={() => submit(guess)}
            >
              Guess
            </Button>
          </div>
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
      {blur === null && (
        <FreeHintCard
          hint={mine.hint}
          hints={done ? undefined : mine.hints}
          onTake={onHint}
        />
      )}
      {blur !== null && <BlurGuesses rows={newestFirst} />}
      {blur === null && mine.rows.length > 0 && (
        <div id="board" className="results flex flex-col gap-2 sm:gap-2.5">
          <BoardRow
            id="guess-results-titles-row"
            columns={titles.length}
            aria-hidden="true"
          >
            {titles.map((title, i) => (
              <TitleTile key={i} className="guess-result-title">
                {title}
              </TitleTile>
            ))}
          </BoardRow>
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
