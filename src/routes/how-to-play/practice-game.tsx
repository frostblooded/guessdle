// How to play's practice game: four short steps on the frozen pet game copy, from "there is a
// secret pet" to a win, explaining each clue in plain words. Graded in the browser.
import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { BoardRow, GuessRow, TitleTile } from "../../components/board.tsx";
import { Button, buttonVariants } from "../../components/ui/button.tsx";
import { Card } from "../../components/ui/card.tsx";
import { correctnessClass } from "../../game/correctness.ts";
import {
  boardColumns,
  gradeGuess,
  type BoardColumn,
  type Entry,
} from "../../game/game.ts";
import {
  explainRow,
  stillFitting,
  type Tutorial,
} from "../../game/tutorial.ts";
import { PetPicker } from "./pet-picker.tsx";

type Step = "secret" | "first" | "clues" | "narrow" | "won";

const STEP_NUMBER: Record<Exclude<Step, "won">, number> = {
  secret: 1,
  first: 2,
  clues: 3,
  narrow: 4,
};

const SWATCH: Record<string, string> = {
  correct: "bg-correct",
  "partially-correct": "bg-partial",
  incorrect: "bg-incorrect",
};

function Board({
  columns,
  rows,
}: {
  columns: readonly BoardColumn[];
  rows: ReturnType<typeof gradeGuess>[];
}) {
  const images = columns.map((column) => column.image);
  return (
    <div className="practice-board flex flex-col gap-1.5 sm:gap-2">
      <BoardRow images={images} aria-hidden="true">
        {columns.map(({ title }) => (
          <TitleTile key={title}>{title}</TitleTile>
        ))}
      </BoardRow>
      {rows.length === 0 ? (
        <BoardRow
          images={images}
          className="practice-secret"
          role="img"
          aria-label="The secret pet: every column is hidden"
        >
          {columns.map(({ title }) => (
            <div
              key={title}
              className="cell flex min-h-12 items-center justify-center rounded-lg border-2 border-dashed text-lg font-bold text-muted-foreground sm:min-h-16"
            >
              ?
            </div>
          ))}
        </BoardRow>
      ) : (
        [...rows]
          .reverse()
          .map((row, i) => <GuessRow key={rows.length - i} row={row} />)
      )}
    </div>
  );
}

// What the newest row says, one colored line per column
function Clues({ lines, grades }: { lines: string[]; grades: string[] }) {
  return (
    <ul className="practice-clues space-y-1.5 text-sm sm:text-base">
      {lines.map((line, i) => (
        <li key={i} className="flex items-start gap-2">
          <span
            className={`mt-1 size-3 shrink-0 rounded-sm ${SWATCH[grades[i]!] ?? ""}`}
            aria-hidden="true"
          />
          <span>{line}</span>
        </li>
      ))}
    </ul>
  );
}

// One step of a practice round, shared by every game kind's round: a small label such as
// "Step 2 of 4" over its title
export function PracticeCard({
  step,
  label,
  title,
  children,
}: {
  step: string;
  label?: string | undefined;
  title: string;
  children: ReactNode;
}) {
  return (
    <Card
      className="practice-step space-y-4 p-4 sm:p-6"
      data-step={step}
      aria-live="polite"
    >
      <div className="space-y-1">
        {label && (
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {label}
          </p>
        )}
        <h2 className="text-xl font-semibold">{title}</h2>
      </div>
      {children}
    </Card>
  );
}

function StepCard({
  step,
  title,
  children,
}: {
  step: Step;
  title: string;
  children: ReactNode;
}) {
  return (
    <PracticeCard
      step={step}
      label={step === "won" ? undefined : `Step ${STEP_NUMBER[step]} of 4`}
      title={title}
    >
      {children}
    </PracticeCard>
  );
}

// A finished practice round's way out: to the gallery, or another round
export function PracticeEnd({ onRestart }: { onRestart: () => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Link
        className={buttonVariants({
          size: "lg",
          className: "no-underline",
        })}
        to="/"
      >
        Start playing
      </Link>
      <Button size="lg" variant="outline" onClick={onRestart}>
        Practice again
      </Button>
    </div>
  );
}

export function PracticeGame({ tutorial }: { tutorial: Tutorial }) {
  const { attributes, entries, answerId } = tutorial;
  const answer = entries.find((e) => e.id === answerId) ?? entries[0]!;
  const columns = boardColumns(attributes);
  const [step, setStep] = useState<Step>("secret");
  const [guesses, setGuesses] = useState<Entry[]>([]);
  const rows = useMemo(
    () => guesses.map((guess) => gradeGuess(attributes, answer, guess)),
    [attributes, answer, guesses],
  );
  const fitting = useMemo(
    () =>
      new Set(
        stillFitting(attributes, entries, guesses, rows).map((e) => e.id),
      ),
    [attributes, entries, guesses, rows],
  );
  const guessed = new Set(guesses.map((g) => g.id));
  const last = rows.at(-1);
  const clues = last && (
    <Clues
      lines={explainRow(attributes, last)}
      grades={last
        .filter((cell) => !cell.image)
        .map((cell) => correctnessClass(cell.correctness))}
    />
  );

  const pick = (entry: Entry): void => {
    setGuesses((g) => [...g, entry]);
    setStep(
      entry.id === answer.id ? "won" : step === "first" ? "clues" : "narrow",
    );
  };
  const restart = (): void => {
    setGuesses([]);
    setStep("secret");
  };

  switch (step) {
    case "secret":
      return (
        <StepCard step={step} title="There is a secret pet">
          <p>
            Every day the game picks one secret pet. Nobody knows which one, not
            even you. Your goal is to find it, using as few guesses as you can.
          </p>
          <Board columns={columns} rows={rows} />
          <Button size="lg" onClick={() => setStep("first")}>
            Next
          </Button>
        </StepCard>
      );
    case "first":
      return (
        <StepCard step={step} title="Make your first guess">
          <p>
            You know nothing yet, and that is normal. <b>Just tap any pet.</b>{" "}
            Your first guess is not meant to be right: its job is to give you
            clues.
          </p>
          <PetPicker
            entries={entries}
            guessed={guessed}
            fitting={null}
            onPick={pick}
          />
        </StepCard>
      );
    case "clues":
      return (
        <StepCard step={step} title="Read your clues">
          <p>
            Your guess became a row. Each colored box compares it with the
            secret pet: <b>green</b> is the same, <b>orange</b> is partly the
            same, <b>red</b> is different.
          </p>
          <Board columns={columns} rows={rows} />
          {clues}
          <Button size="lg" onClick={() => setStep("narrow")}>
            Next guess
          </Button>
        </StepCard>
      );
    case "narrow":
      return (
        <StepCard step={step} title="Guess again, using the clues">
          <p>
            Pick a pet that fits every clue so far. To help you this time, pets
            that no longer fit are faded.{" "}
            <b className="practice-fitting">
              {fitting.size === 1
                ? "Only 1 pet still fits."
                : `${fitting.size} pets still fit.`}
            </b>
          </p>
          <Board columns={columns} rows={rows} />
          {rows.length > 1 && clues}
          <PetPicker
            entries={entries}
            guessed={guessed}
            fitting={fitting}
            onPick={pick}
          />
        </StepCard>
      );
    case "won":
      return (
        <StepCard step={step} title="You found it!">
          <p className="practice-result">
            {answer.name} was the secret pet.{" "}
            {rows.length === 1
              ? "First try: lucky you!"
              : `You got it in ${rows.length} guesses.`}
          </p>
          <Board columns={columns} rows={rows} />
          <ul className="list-disc space-y-1.5 pl-5 text-muted-foreground">
            <li>Real games pick a new secret every day.</li>
            <li>
              Nothing is faded there: you rule pets out in your head, just like
              you did here.
            </li>
            <li>
              New to this? On a game&apos;s page, switch from <b>Type</b> to{" "}
              <b>Select</b>
              to pick from a list of every answer instead of typing names.
            </li>
          </ul>
          <PracticeEnd onRestart={restart} />
        </StepCard>
      );
  }
}
