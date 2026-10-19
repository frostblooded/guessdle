// A Blur game's board (ADR 0019), shared by Play and party rounds: the answer's image in a
// square frame with only the earned squares clear, and the whole image once it is over.
import type { ReactNode } from "react";
import { cn } from "../lib/utils.ts";
import { Correctness } from "../game/correctness.ts";
import { isSkipRow, nameCell, type GradedAttribute } from "../game/game.ts";
import { blurProgress, CELLS } from "../game/blur.ts";

export function BlurView({
  boardUrl,
  tries,
  wrong,
  finished,
  reveal,
  children,
}: {
  // The image with n squares clear
  boardUrl: (n: number) => string;
  tries: number;
  // Wrong guesses so far
  wrong: number;
  finished: boolean;
  // The whole image, once the day or round is over
  reveal?: string | undefined;
  // Drawn over the image, such as How to play's covered squares
  children?: ReactNode;
}) {
  const { shown, left } = blurProgress(wrong, tries, finished);
  const whole = finished && reveal ? reveal : null;
  const src = whole ?? boardUrl(shown);
  return (
    <div id="blur-view" className="mb-6 flex flex-col items-center gap-3">
      <div className="relative aspect-square w-full max-w-sm overflow-hidden rounded-xl border bg-muted shadow-sm">
        <img
          id="blur-current"
          key={src}
          className="animate-in size-full object-cover"
          src={src}
          alt={
            whole
              ? "The whole image"
              : `The image, ${shown} of ${CELLS} squares clear`
          }
        />
        {children}
      </div>
      <p id="blur-tries" className="text-sm font-medium text-muted-foreground">
        {finished
          ? `${tries} ${tries === 1 ? "try" : "tries"}`
          : `${shown} of ${CELLS} squares clear · ${left} ${left === 1 ? "try" : "tries"} left`}
      </p>
    </div>
  );
}

// A Blur game's guesses, newest first: names only, green for the answer, red otherwise, grey
// for a skip, each labelled with its guess number
export function BlurGuesses({ rows }: { rows: readonly GradedAttribute[][] }) {
  return (
    <ol
      id="guess-results-container"
      className="mx-auto flex w-full max-w-md flex-col gap-2"
      aria-label="Your guesses"
    >
      {rows.map((row, i) => {
        const cell = nameCell(row);
        const right = cell.correctness === Correctness.Correct;
        return (
          <li
            key={rows.length - i}
            className="animate-in flex items-center gap-3"
          >
            <span className="guess-number w-16 shrink-0 text-right text-sm font-medium text-muted-foreground">
              Guess {rows.length - i}
            </span>
            <div
              className={cn(
                "guess-result-cell min-w-0 flex-1 rounded-lg px-3 py-2.5 text-center font-bold text-white",
                right
                  ? "correct bg-correct"
                  : isSkipRow(row)
                    ? "skipped border border-dashed bg-muted font-medium text-muted-foreground"
                    : "incorrect bg-incorrect",
              )}
            >
              {String(cell.value)}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
