// How to play's Quiz practice round: three questions about the practice pets, two to tap and one
// number scored by closeness. Unlike a real quiz, each answer is checked right away.
import { useState } from "react";
import { Button } from "../../components/ui/button.tsx";
import type { Entry } from "../../game/game.ts";
import {
  isAnswerTo,
  questionOf,
  rightAnswerText,
  scoreAnswer,
  scoreText,
  type QuizAnswer,
  type QuizSpec,
} from "../../game/quiz.ts";
import type { Tutorial } from "../../game/tutorial.ts";
import { cn } from "../../lib/utils.ts";
import { pointsWord, Question } from "../play/quiz-play.tsx";
import { PracticeCard, PracticeEnd } from "./practice-game.tsx";

const OPTIONS = 4;
// How far off a count may be before it scores 0
const COUNT_RANGE = 4;

interface PracticeQuestion {
  id: number;
  prompt: string;
  photo: string;
  spec: QuizSpec;
}

// "Which pet is this?" with the pet's photo, and it plus the pets after it as options
function whichPet(pets: readonly Entry[], at: number): PracticeQuestion {
  const pet = pets[at % pets.length]!;
  const options = [
    ...new Set(
      Array.from(
        { length: Math.min(OPTIONS, pets.length) },
        (_, i) => pets[(at + i) % pets.length]!.name,
      ),
    ),
  ].sort((a, b) => a.localeCompare(b));
  return {
    id: at,
    prompt: "Which pet is this?",
    photo: pet.photo,
    spec: { options, correct: options.indexOf(pet.name) },
  };
}

function practiceQuestions(
  entries: readonly Entry[],
  round: number,
): PracticeQuestion[] {
  const pets = entries.filter((e) => e.photo);
  return [
    whichPet(pets, round * 2),
    {
      id: -1,
      prompt: "How many pets are in the practice games?",
      photo: "",
      spec: { answer: String(entries.length), range: String(COUNT_RANGE) },
    },
    whichPet(pets, round * 2 + 1),
  ];
}

export function QuizPractice({ tutorial }: { tutorial: Tutorial }) {
  const [round, setRound] = useState(0);
  const [at, setAt] = useState(0);
  const [answers, setAnswers] = useState<QuizAnswer[]>([]);
  const [answer, setAnswer] = useState<QuizAnswer | undefined>();
  const questions = practiceQuestions(tutorial.entries, round);
  const scores = answers.map((a, i) => scoreAnswer(questions[i]!.spec, a));
  const total = scores.reduce((sum, points) => sum + points, 0);

  if (at === questions.length) {
    return (
      <PracticeCard step="done" title="Your score">
        <p className="practice-result text-2xl font-bold tabular-nums">
          {scoreText(total)} / {questions.length}
        </p>
        <ul className="list-disc space-y-1.5 pl-5 text-muted-foreground">
          <li>
            A real quiz shows the right answers only at the end, with how
            everyone else scored.
          </li>
          <li>
            Only your first score counts. You can still retake it for fun.
          </li>
        </ul>
        <PracticeEnd
          onRestart={() => {
            setRound((r) => r + 1);
            setAt(0);
            setAnswers([]);
          }}
        />
      </PracticeCard>
    );
  }
  const question = questions[at]!;
  const checked = answers.length > at;
  const points = scores[at] ?? 0;
  const last = at === questions.length - 1;
  const choice = "options" in question.spec;
  return (
    <PracticeCard
      step={`question-${at + 1}`}
      label={`Quiz practice · Question ${at + 1} of ${questions.length}`}
      title={
        at === 0
          ? "Answer the questions"
          : choice
            ? "Tap an answer"
            : "Type a number"
      }
    >
      <p>
        {at === 0
          ? "A quiz is a list of questions. Each right answer is worth 1 point."
          : choice
            ? "Back to tapping. You know these pets by now."
            : "Number questions give points for coming close: the further off you are, the fewer you get."}
      </p>
      <Question
        question={questionOf(
          { id: question.id, name: question.prompt, photo: question.photo },
          question.spec,
        )}
        answer={checked ? answers[at] : answer}
        onAnswer={checked ? () => undefined : setAnswer}
      />
      {checked ? (
        <>
          <p
            className={cn(
              "practice-feedback border-l-4 pl-3 font-semibold",
              points >= 1
                ? "border-l-correct"
                : points > 0
                  ? "border-l-partial"
                  : "border-l-incorrect",
            )}
          >
            {points >= 1
              ? `Right! ${pointsWord(points)}.`
              : `${points > 0 ? "Close" : "Not this time"}: the answer is ${rightAnswerText(question.spec)}. ${pointsWord(points)}.`}
          </p>
          <Button
            size="lg"
            onClick={() => {
              setAt(at + 1);
              setAnswer(undefined);
            }}
          >
            {last ? "See your score" : "Next question"}
          </Button>
        </>
      ) : (
        <Button
          size="lg"
          disabled={!isAnswerTo(question.spec, answer)}
          onClick={() => setAnswers([...answers, answer!])}
        >
          Check my answer
        </Button>
      )}
    </PracticeCard>
  );
}
