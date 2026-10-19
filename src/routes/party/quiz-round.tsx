// A live party round of a Quiz game (ADR 0021): the question, and the viewer's one answer.
// Whether it was right shows once the round ends.
import { useState } from "react";
import { Button } from "../../components/ui/button.tsx";
import { Card } from "../../components/ui/card.tsx";
import type { LiveRound } from "../../game/party.ts";
import type { QuizQuestion } from "../../game/quiz.ts";
import { Question } from "../play/quiz-play.tsx";

export function QuizRound({
  round,
  question,
  answered,
  onAnswer,
}: {
  round: LiveRound;
  question: QuizQuestion;
  // The viewer's answer as text, null before answering
  answered: string | null;
  // False when the socket is down and the answer was not sent
  onAnswer: (answer: string) => boolean;
}) {
  const [answer, setAnswer] = useState<string | undefined>(undefined);
  return (
    <section id="round" aria-labelledby="round-title">
      <h2 id="round-title" className="mb-3 text-lg font-semibold">
        Question {round.number}
      </h2>
      <Card id="guess-card" className="play-card mb-6 gap-4 p-4 sm:p-5">
        {answered === null ? (
          <>
            <Question
              question={question}
              answer={answer}
              onAnswer={setAnswer}
            />
            <Button
              id="quiz-answer"
              className="self-end"
              disabled={answer === undefined || answer.trim() === ""}
              onClick={() => answer !== undefined && onAnswer(answer)}
            >
              Answer
            </Button>
          </>
        ) : (
          <div id="result-banner" aria-live="polite" className="space-y-1">
            <p className="font-semibold [overflow-wrap:anywhere]">
              {question.prompt}
            </p>
            <p>
              Your answer: <strong>{answered}</strong>. Waiting for the others
              to answer.
            </p>
          </div>
        )}
      </Card>
    </section>
  );
}
