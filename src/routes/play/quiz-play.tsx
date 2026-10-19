// A Quiz game's Play page (ADR 0021): one question at a time, then the score, the review with
// the right answers and how everyone's first scores spread. A retake starts over; only the
// first score counts.
import { useRef, useState } from "react";
import { Navigate } from "react-router";
import { PageHead } from "../../components/page.tsx";
import { Alert } from "../../components/ui/alert.tsx";
import { Button } from "../../components/ui/button.tsx";
import { Card } from "../../components/ui/card.tsx";
import { Input, Label } from "../../components/ui/input.tsx";
import { FAILURES } from "../../game/failures.ts";
import {
  scoreText,
  type QuizAnswer,
  type QuizQuestion,
  type QuizResult,
} from "../../game/quiz.ts";
import { playerToken } from "../../game/stats.ts";
import { cn } from "../../lib/utils.ts";
import { api, errorText } from "../../manage-client.ts";
import type { PlayableGame } from "./load-game.ts";
import { PlayActions, PlayStatus } from "./play-status.tsx";
import { BarChart } from "./stats-dialog.tsx";

const pointsWord = (n: number): string =>
  `${scoreText(n)} ${n === 1 ? "point" : "points"}`;

// The current question: its picture, then options to tap or a number box
export function Question({
  question,
  answer,
  onAnswer,
}: {
  question: QuizQuestion;
  answer: QuizAnswer | undefined;
  onAnswer: (answer: QuizAnswer) => void;
}) {
  return (
    <div className="space-y-4">
      {question.photo && (
        <img
          id="quiz-photo"
          className="mx-auto max-h-72 rounded-lg object-contain"
          src={question.photo}
          alt=""
        />
      )}
      <h2
        id="quiz-prompt"
        className="text-xl font-semibold [overflow-wrap:anywhere]"
      >
        {question.prompt}
      </h2>
      {question.options ? (
        <div
          id="quiz-options"
          role="radiogroup"
          aria-labelledby="quiz-prompt"
          className="grid gap-2 sm:grid-cols-2"
        >
          {question.options.map((option, i) => (
            <Button
              key={i}
              role="radio"
              aria-checked={answer === String(i)}
              variant={answer === String(i) ? "default" : "outline"}
              className="h-auto min-h-11 justify-start py-2 text-left whitespace-normal"
              onClick={() => onAnswer(String(i))}
            >
              {option}
            </Button>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="quiz-number">Your answer (a number)</Label>
          <Input
            id="quiz-number"
            inputMode="decimal"
            autoComplete="off"
            value={answer ?? ""}
            onChange={(event) => onAnswer(event.target.value)}
          />
        </div>
      )}
    </div>
  );
}

// The finished quiz: score, spread and every question with the right answer
function Review({
  result,
  onRetake,
}: {
  result: QuizResult;
  onRetake: () => void;
}) {
  const { stats } = result;
  const mine = stats.first === null ? -1 : Math.floor(stats.first);
  return (
    <div id="quiz-result" className="space-y-6">
      <Card className="items-center gap-2 p-6 text-center">
        <p className="text-sm font-bold uppercase">Your score</p>
        <p id="quiz-score" className="text-4xl font-bold tabular-nums">
          {scoreText(result.score)} / {result.total}
        </p>
        <p id="quiz-first" className="text-sm text-muted-foreground">
          {stats.first === null
            ? "Your score could not be recorded."
            : stats.first === result.score
              ? "Only your first score counts in the stats."
              : `Only your first score counts in the stats: ${scoreText(stats.first)} / ${result.total}.`}
        </p>
        <Button id="quiz-retake" className="mt-2" onClick={onRetake}>
          Take it again
        </Button>
      </Card>
      <Card className="p-6">
        <p id="quiz-players" className="mb-3 text-center text-sm">
          {stats.players === 1
            ? "You are the first to take this quiz."
            : `${stats.players} players took this quiz.`}
        </p>
        <BarChart
          id="quiz-spread"
          title="First scores"
          bars={stats.spread.map((count, i) => ({
            label: String(i),
            count,
            mine: i === mine,
          }))}
        />
      </Card>
      <ol id="quiz-review" className="space-y-3">
        {result.review.map((item, i) => (
          <li key={item.id}>
            <Card
              className={cn(
                "quiz-review-item gap-1 border-l-4 p-4",
                item.points >= 1
                  ? "border-l-correct"
                  : item.points > 0
                    ? "border-l-partial"
                    : "border-l-incorrect",
              )}
            >
              <p className="font-semibold [overflow-wrap:anywhere]">
                {i + 1}. {item.prompt}
              </p>
              <p className="text-sm">
                Your answer: {item.yours ?? "no answer"}
              </p>
              <p className="text-sm">Right answer: {item.right}</p>
              <p className="text-sm font-bold">{pointsWord(item.points)}</p>
            </Card>
          </li>
        ))}
      </ol>
    </div>
  );
}

// A quiz has no days: its own page, whatever day the address names
export function QuizPlay({
  slug,
  game,
  day,
}: {
  slug: string;
  game: PlayableGame;
  day: number | null;
}) {
  const questions = game.questions ?? [];
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, QuizAnswer>>({});
  const [result, setResult] = useState<QuizResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // When this attempt began; set by the first answer
  const started = useRef<number | null>(null);
  const question = questions[index];
  const last = index === questions.length - 1;

  if (day !== null) {
    return <Navigate replace to={`/g/${encodeURIComponent(slug)}`} />;
  }

  const finish = async (): Promise<void> => {
    setError("");
    setBusy(true);
    const reply = await api<QuizResult>(
      "POST",
      `/api/games/${encodeURIComponent(slug)}/quiz`,
      {
        answers,
        seconds:
          started.current === null
            ? null
            : Math.round((Date.now() - started.current) / 1000),
        player: playerToken(localStorage),
      },
    );
    setBusy(false);
    if (reply?.status === 200) {
      setResult(reply.data);
    } else {
      setError(errorText(reply));
    }
  };

  const retake = (): void => {
    setResult(null);
    setAnswers({});
    setIndex(0);
    started.current = null;
  };

  return (
    <>
      <PageHead
        centered
        titleId="game-title"
        title={game.name}
        actions={
          <PlayActions
            slug={slug}
            canHost={questions.length > 0}
            canEdit={game.canEdit}
            saveName={questions.length > 0 ? game.name : undefined}
          />
        }
      />
      <PlayStatus slug={slug} view={game} />
      <Alert id="notice" variant="warn" role="status" className="mb-4">
        {questions.length === 0 ? FAILURES.not_enough_entries.text : error}
      </Alert>
      {result ? (
        <Review result={result} onRetake={retake} />
      ) : (
        question && (
          <Card id="quiz" className="play-card mb-6 gap-5 p-4 sm:p-6">
            <p id="quiz-progress" className="text-sm text-muted-foreground">
              Question {index + 1} of {questions.length}
            </p>
            <Question
              key={question.id}
              question={question}
              answer={answers[String(question.id)]}
              onAnswer={(answer) => {
                started.current ??= Date.now();
                setAnswers((a) => ({ ...a, [String(question.id)]: answer }));
              }}
            />
            <div className="flex flex-wrap justify-between gap-2">
              <Button
                id="quiz-back"
                variant="outline"
                disabled={index === 0}
                onClick={() => setIndex(index - 1)}
              >
                Back
              </Button>
              {last ? (
                <Button
                  id="quiz-finish"
                  disabled={busy}
                  onClick={() => void finish()}
                >
                  Finish
                </Button>
              ) : (
                <Button id="quiz-next" onClick={() => setIndex(index + 1)}>
                  Next
                </Button>
              )}
            </div>
          </Card>
        )
      )}
    </>
  );
}
