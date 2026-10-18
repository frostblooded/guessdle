// A party view's scoreboard, the podium of an ended party and its finished rounds.
import { Badge } from "../../components/ui/badge.tsx";
import { Button } from "../../components/ui/button.tsx";
import { Card } from "../../components/ui/card.tsx";
import { correctnessClass } from "../../game/correctness.ts";
import {
  clockTime,
  ordinal,
  progressLabel,
  type FinishedRound,
  type PartyView,
  type Standing,
} from "../../game/party.ts";
import { quizPoints } from "../../game/quiz.ts";
import { cn } from "../../lib/utils.ts";

const points = (n: number): string => `${n} ${n === 1 ? "point" : "points"}`;

const SQUARE_COLORS: Record<string, string> = {
  correct: "bg-correct",
  "partially-correct": "bg-partial",
  incorrect: "bg-incorrect",
};

// Place, nickname, points and the live round's progress; the host gets Remove buttons
export function Players({
  view,
  onRemove,
}: {
  view: PartyView;
  onRemove: (player: Standing) => void;
}) {
  const live = view.round?.live === true ? view.round : null;
  return (
    <Card className="party-players-card my-6 p-4 sm:p-5">
      <h2 id="players-title" className="mb-2 text-lg font-semibold">
        Players
      </h2>
      <ol
        id="players"
        aria-labelledby="players-title"
        className="party-players divide-y"
      >
        {view.players.map((player) => {
          const progress = live?.progress.find((p) => p.playerId === player.id);
          return (
            <li
              key={player.id}
              data-player-id={player.id}
              className="party-player grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 py-2 [overflow-wrap:anywhere]"
            >
              {/* No place before the first round has a result */}
              <span className="party-place row-span-2 font-bold text-muted-foreground">
                {view.history.length > 0 ? ordinal(player.place) : ""}
              </span>
              <span className="party-player-name font-semibold">
                {player.nickname}
                {player.id === view.you?.playerId && (
                  <span className="text-sm font-normal text-muted-foreground">
                    {" "}
                    (you)
                  </span>
                )}
                {player.host && (
                  <>
                    {" "}
                    <Badge>Host</Badge>
                  </>
                )}
              </span>
              <span className="party-points col-start-3 row-start-1 justify-self-end font-bold whitespace-nowrap">
                {points(player.points)}
              </span>
              {progress && (
                <span
                  className={cn(
                    "party-player-detail col-start-2 text-sm text-muted-foreground",
                    progress.solved && "solved font-semibold text-success",
                  )}
                >
                  {progressLabel(progress)}
                </span>
              )}
              {view.you?.host && !player.host && !view.ended && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="col-start-3 justify-self-end"
                  aria-label={`Remove ${player.nickname}`}
                  onClick={() => onRemove(player)}
                >
                  Remove
                </Button>
              )}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

const STEP_ORDER: Record<number, string> = {
  1: "order-2 min-h-36 border-success bg-success-bg",
  2: "order-1 min-h-28",
  3: "order-3 min-h-22",
};

// The top three of an ended party
export function Podium({ view }: { view: PartyView }) {
  return (
    <div
      id="podium"
      className="podium my-6 flex items-end justify-center gap-2"
    >
      {view.players
        .filter((p) => p.place <= 3)
        .slice(0, 3)
        .map((p) => (
          <div
            key={p.id}
            className={cn(
              `podium-step podium-${p.place} grid max-w-44 min-w-0 flex-1 justify-items-center rounded-t-xl border bg-card px-2 py-3 text-center [overflow-wrap:anywhere]`,
              STEP_ORDER[p.place],
            )}
          >
            <span className="podium-place text-lg font-extrabold">
              {ordinal(p.place)}
            </span>
            <strong className="podium-name">{p.nickname}</strong>
            <span className="text-sm text-muted-foreground">
              {points(p.points)}
            </span>
          </div>
        ))}
    </div>
  );
}

const nameOf = (view: PartyView, id: number): string =>
  view.players.find((p) => p.id === id)?.nickname ?? "Removed player";

// One finished round: its answer, then each player's place, points, guesses and solve time
function Round({ view, round }: { view: PartyView; round: FinishedRound }) {
  return (
    <Card className="party-round mb-4 p-4 sm:p-5">
      <div className="party-round-head flex items-center gap-3">
        {round.answer.photo && (
          <img
            className="party-round-photo size-14 rounded-md object-cover"
            src={round.answer.photo}
            alt=""
          />
        )}
        <div>
          <h3 className="font-semibold">Round {round.number}</h3>
          {round.right === undefined ? (
            <p className="text-sm text-muted-foreground">
              The answer was {round.answer.name}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">
              {round.answer.name} The right answer was {round.right}.
            </p>
          )}
        </div>
      </div>
      <ol className="party-results mt-3 divide-y">
        {round.results.map((result) => (
          <li key={result.playerId} className="party-result">
            <div className="party-result-summary grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 py-2 [overflow-wrap:anywhere]">
              <span className="party-place font-bold text-muted-foreground">
                {result.place === null ? "–" : ordinal(result.place)}
              </span>
              <strong className="party-player-name">
                {nameOf(view, result.playerId)}
              </strong>
              <span className="party-points col-start-3 row-start-1 justify-self-end font-bold">
                +{result.points}
              </span>
              <span className="party-player-detail col-start-2 text-sm text-muted-foreground">
                {result.score !== undefined
                  ? `${quizPoints(result.score)} in ${clockTime(result.timeMs!)}`
                  : round.right !== undefined
                    ? "No answer"
                    : result.solved
                      ? `${result.guesses} ${result.guesses === 1 ? "guess" : "guesses"} in ${clockTime(result.timeMs!)}`
                      : result.gaveUp
                        ? "Gave up"
                        : result.lost
                          ? "Out of tries"
                          : "Did not solve"}
              </span>
            </div>
            <div className="party-guesses grid gap-0.5 pb-2 pl-[3.25rem] text-sm">
              {result.grades.map((grades, i) => (
                <div key={i} className="party-guess flex items-center gap-2">
                  <span
                    className="party-squares inline-flex gap-0.5"
                    aria-hidden="true"
                  >
                    {grades.map((grade, j) => (
                      <span
                        key={j}
                        className={cn(
                          "party-square size-3 rounded-[2px]",
                          correctnessClass(grade),
                          SQUARE_COLORS[correctnessClass(grade)],
                        )}
                      />
                    ))}
                  </span>
                  <span>{result.guessNames[i] ?? ""}</span>
                </div>
              ))}
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

export function History({ view }: { view: PartyView }) {
  return (
    <section id="history" aria-labelledby="history-title">
      <h2 id="history-title" className="mb-3 text-lg font-semibold">
        Finished rounds
      </h2>
      <div id="history-list">
        {view.history.map((round) => (
          <Round key={round.number} view={view} round={round} />
        ))}
      </div>
    </section>
  );
}
