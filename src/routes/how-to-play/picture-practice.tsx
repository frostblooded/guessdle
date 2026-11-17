import { useState, type ReactNode } from "react";
import { BlurView } from "../../components/blur-view.tsx";
import { SequenceView } from "../../components/sequence-view.tsx";
import { CELLS } from "../../game/blur.ts";
import type { Entry } from "../../game/game.ts";
import type { Tutorial } from "../../game/tutorial.ts";
import { cn } from "../../lib/utils.ts";
import { PetPicker } from "./pet-picker.tsx";
import { PracticeCard, PracticeEnd } from "./practice-game.tsx";

interface Board {
  secret: Entry;
  wrong: number;
  finished: boolean;
}

function PictureRound({
  tutorial,
  kind,
  start,
  tries,
  title,
  intro,
  afterMiss,
  board,
  outro,
}: {
  tutorial: Tutorial;
  kind: string;
  start: number;
  tries: number;
  title: string;
  intro: ReactNode;
  afterMiss: string;
  board: (board: Board) => ReactNode;
  outro: ReactNode;
}) {
  const pets = tutorial.entries.filter((e) => e.photo);
  const [round, setRound] = useState(0);
  const [guesses, setGuesses] = useState<Entry[]>([]);
  const secret = pets[(start + round) % pets.length];
  if (!secret) {
    return null;
  }
  const won = guesses.at(-1)?.id === secret.id;
  const wrong = guesses.length - Number(won);
  const finished = won || wrong >= tries;
  const view = board({ secret, wrong, finished });
  const restart = (): void => {
    setRound((r) => r + 1);
    setGuesses([]);
  };

  if (finished) {
    return (
      <PracticeCard
        step="done"
        title={won ? "You found it!" : "Out of tries"}
        key={`${kind}-${round}-done`}
      >
        <p className="practice-result">
          {secret.name} was the secret pet.{" "}
          {!won
            ? "Next time, look closely at every new clue."
            : guesses.length === 1
              ? "First try: well spotted!"
              : `You got it in ${guesses.length} guesses.`}
        </p>
        {view}
        {outro}
        <PracticeEnd onRestart={restart} />
      </PracticeCard>
    );
  }
  const miss = guesses.at(-1);
  return (
    <PracticeCard
      step="play"
      label={`${kind} practice`}
      title={title}
      key={`${kind}-${round}`}
    >
      <p>{intro}</p>
      {view}
      {miss && (
        <p className="practice-miss font-semibold">
          Not {miss.name}. {afterMiss}
        </p>
      )}
      <PetPicker
        entries={pets}
        guessed={new Set(guesses.map((g) => g.id))}
        fitting={null}
        photos={false}
        onPick={(pet) => setGuesses((g) => [...g, pet])}
      />
    </PracticeCard>
  );
}

const BLUR_TRIES = 5;
const BLUR_ORDER = [4, 0, 8, 2, 6, 1, 7, 3, 5];

export function BlurPractice({ tutorial }: { tutorial: Tutorial }) {
  return (
    <PictureRound
      tutorial={tutorial}
      kind="Blur"
      start={1}
      tries={BLUR_TRIES}
      title="Name the pet from a picture"
      intro={
        <>
          The secret pet&apos;s photo is split into nine squares, and only one
          is clear. <b>Tap the pet you think it is.</b> Every wrong guess clears
          one more square. You have {BLUR_TRIES} tries.
        </>
      }
      afterMiss="One more square is clear."
      board={({ secret, wrong, finished }) => (
        <BlurView
          boardUrl={() => secret.photo}
          tries={BLUR_TRIES}
          wrong={wrong}
          finished={finished}
        >
          <div className="absolute inset-0 grid grid-cols-3 grid-rows-3">
            {Array.from({ length: CELLS }, (_, cell) => (
              <div
                key={cell}
                className={cn(
                  "blur-cell border border-background/40 transition-all duration-500",
                  !finished &&
                    !BLUR_ORDER.slice(0, wrong + 1).includes(cell) &&
                    "covered bg-muted/80 backdrop-blur-2xl",
                )}
              />
            ))}
          </div>
        </BlurView>
      )}
      outro={
        <ul className="list-disc space-y-1.5 pl-5 text-muted-foreground">
          <li>Real Blur games pick a new picture every day.</li>
          <li>The game&apos;s maker picks how many tries you get.</li>
          <li>
            Stuck? Real games let you skip a guess to clear the next square.
          </li>
        </ul>
      }
    />
  );
}

const SEQUENCE_ZOOM = [3.2, 2.2, 1.5, 1];

export function SequencePractice({ tutorial }: { tutorial: Tutorial }) {
  const tries = SEQUENCE_ZOOM.length;
  return (
    <PictureRound
      tutorial={tutorial}
      kind="Sequence"
      start={2}
      tries={tries}
      title="Name the pet from its photos"
      intro={
        <>
          The secret pet comes as a series of photos, hardest first.{" "}
          <b>Tap the pet you think it is.</b> Every wrong guess unlocks the next
          photo. Tap a number to look back at one you already have.
        </>
      }
      afterMiss="The next photo is unlocked."
      board={({ secret, wrong, finished }) => (
        <SequenceView
          shotUrl={() => secret.photo}
          tries={tries}
          wrong={wrong}
          finished={finished}
          shotStyle={(n) => ({ transform: `scale(${SEQUENCE_ZOOM[n - 1]})` })}
        />
      )}
      outro={
        <ul className="list-disc space-y-1.5 pl-5 text-muted-foreground">
          <li>Real Sequence games use different photos, not zoomed ones.</li>
          <li>
            Stuck? Real games let you skip a guess to unlock the next photo.
          </li>
        </ul>
      }
    />
  );
}
