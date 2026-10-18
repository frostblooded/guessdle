import type { ReactNode } from "react";
import { Link } from "react-router";
import {
  BoardRow,
  GradeTile,
  PhotoTile,
  TitleTile,
} from "../components/board.tsx";
import { PageHead } from "../components/page.tsx";
import { buttonVariants } from "../components/ui/button.tsx";
import { Card } from "../components/ui/card.tsx";
import { useTitle } from "../lib/use-title.ts";
import ati from "../../howto/ati.jpg";
import cookie from "../../howto/cookie.jpg";
import eddie from "../../howto/eddie.jpg";

const TITLES = ["Photo", "Name", "Colors", "Owners"];

type Example = [photo: string, name: string, ...cells: [string, string][]];

const COOKIE: Example = [
  cookie,
  "Cookie",
  ["incorrect", "Cookie"],
  ["correct", "Black, Orange, White"],
  ["correct", "Niki"],
];

const STEPS: { title: string; text: ReactNode; example: Example | null }[] = [
  {
    title: "1. Mystery pet",
    text: "Every day one pet is secret. Your job: find out which one. You get unlimited guesses.",
    example: null,
  },
  {
    title: "2. Make a guess",
    text: (
      <>
        Type a pet name and press Guess. Every guess adds a row, colored by how
        close it is. Let us guess <b>Cookie</b>.
      </>
    ),
    example: COOKIE,
  },
  {
    title: "3. Green and red",
    text: (
      <>
        <b>Green</b>: same as the secret pet. <b>Red</b>: not the same. Cookie
        is not Ati (red name), but has Ati&apos;s colors and owner (green).
      </>
    ),
    example: COOKIE,
  },
  {
    title: "4. Orange",
    text: (
      <>
        Now guess <b>Eddie</b>. Colors and owners are lists, so they can be{" "}
        <b>orange</b>: some items match, not all. Eddie and Ati both have Orange
        and White, but Ati also has Black.
      </>
    ),
    example: [
      eddie,
      "Eddie",
      ["incorrect", "Eddie"],
      ["partially-correct", "Orange, White"],
      ["incorrect", "Stefi, Yasen"],
    ],
  },
  {
    title: "5. Photo is a hint",
    text: "The photo never changes color. Use it to remember who is who. A new pet appears every day. Guess Ati and the whole row turns green: you win!",
    example: [
      ati,
      "Ati",
      ["correct", "Ati"],
      ["correct", "Black, Orange, White"],
      ["correct", "Niki"],
    ],
  },
];

function ExampleRows({ example }: { example: Example | null }) {
  const [photo, name, ...cells] = example ?? [];
  return (
    <div className="mt-4 space-y-1.5">
      <BoardRow
        columns={4}
        className="help-example help-head"
        aria-hidden="true"
      >
        {TITLES.map((title) => (
          <TitleTile key={title}>{title}</TitleTile>
        ))}
      </BoardRow>
      {example ? (
        <BoardRow columns={4} className="help-example">
          <PhotoTile src={photo!} alt={name!} />
          {cells.map(([grade, text]) => (
            <GradeTile key={text} grade={grade}>
              {text}
            </GradeTile>
          ))}
        </BoardRow>
      ) : (
        <BoardRow
          columns={4}
          className="help-example"
          role="img"
          aria-label="The secret pet: photo, name, colors and owners are all hidden"
        >
          {TITLES.map((title) => (
            <div
              key={title}
              className="cell help-unknown flex min-h-12 items-center justify-center rounded-lg border-2 border-dashed text-lg font-bold text-muted-foreground sm:min-h-16"
            >
              ?
            </div>
          ))}
        </BoardRow>
      )}
    </div>
  );
}

export function HowToPlayPage() {
  useTitle("How to play - Guessdle");
  return (
    <div className="mx-auto max-w-3xl">
      <PageHead
        title="How to play"
        lede="Five short steps. In this guide the secret pet is Ati."
      />
      <ol className="steps space-y-4">
        {STEPS.map((step) => (
          <li key={step.title}>
            <Card className="help-step p-5 sm:p-6">
              <h2 className="mb-2 text-lg font-semibold">{step.title}</h2>
              <p className="text-muted-foreground">{step.text}</p>
              <ExampleRows example={step.example} />
            </Card>
          </li>
        ))}
      </ol>
      <p className="cta mt-8 text-center">
        <Link
          className={buttonVariants({ size: "lg", className: "no-underline" })}
          to="/"
        >
          Start playing
        </Link>
      </p>
    </div>
  );
}
