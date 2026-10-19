import { useQuery } from "@tanstack/react-query";
import type { ComponentType } from "react";
import { KIND_LABELS } from "../components/game-kind.tsx";
import { PageHead } from "../components/page.tsx";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../components/ui/accordion.tsx";
import { Alert } from "../components/ui/alert.tsx";
import type { GameKind } from "../game/blur.ts";
import type { Tutorial } from "../game/tutorial.ts";
import { getJson } from "../lib/api.ts";
import { useTitle } from "../lib/use-title.ts";
import {
  BlurPractice,
  SequencePractice,
} from "./how-to-play/picture-practice.tsx";
import { PracticeGame } from "./how-to-play/practice-game.tsx";
import { QuizPractice } from "./how-to-play/quiz-practice.tsx";

// One item per game kind, Classic first and open; opening one closes the others
const MODES: {
  kind: GameKind;
  blurb: string;
  Practice: ComponentType<{ tutorial: Tutorial }>;
}[] = [
  {
    kind: "classic",
    blurb: "Guess from a table of clues",
    Practice: PracticeGame,
  },
  {
    kind: "blur",
    blurb: "Guess from a picture that clears up",
    Practice: BlurPractice,
  },
  {
    kind: "sequence",
    blurb: "Guess from a series of photos",
    Practice: SequencePractice,
  },
  {
    kind: "quiz",
    blurb: "Answer questions for points",
    Practice: QuizPractice,
  },
];

export function HowToPlayPage() {
  useTitle("How to play - Guessdle");
  const tutorial = useQuery({
    queryKey: ["tutorial"],
    queryFn: () => getJson<Tutorial>("/api/tutorial"),
    staleTime: Infinity,
  });
  return (
    <div className="mx-auto max-w-3xl">
      <PageHead
        title="How to play"
        lede="Never played a guessing game like this? Pick a kind of game and try a practice round with real pets. Each takes a minute."
      />
      {tutorial.isError && (
        <Alert id="practice-error" variant="error" className="mb-4">
          The practice games could not load. Refresh the page to try again.
        </Alert>
      )}
      <Accordion
        type="single"
        collapsible
        defaultValue="classic"
        className="flex flex-col gap-3"
      >
        {MODES.map(({ kind, blurb, Practice }) => {
          const { label, icon: Icon } = KIND_LABELS[kind];
          return (
            <AccordionItem key={kind} value={kind} id={`help-${kind}`}>
              <AccordionTrigger>
                <span className="flex items-center gap-3">
                  <Icon
                    className="size-5 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <span>
                    {label}
                    <span className="block text-sm font-normal text-muted-foreground">
                      {blurb}
                    </span>
                  </span>
                </span>
              </AccordionTrigger>
              <AccordionContent>
                {tutorial.data ? (
                  <Practice tutorial={tutorial.data} />
                ) : (
                  !tutorial.isError && (
                    <p className="practice-loading text-muted-foreground">
                      Loading the practice round…
                    </p>
                  )
                )}
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}
