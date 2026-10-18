// A Blur game's board (ADR 0019), shared by Play and party rounds: the answer's image in a
// square frame with only the earned squares clear, and the whole image once it is over.
import { cn } from "../lib/utils.ts";
import { Correctness } from "../game/correctness.ts";
import { nameCell, type GradedAttribute } from "../game/game.ts";
import { blurProgress, CELLS } from "../game/blur.ts";

export function BlurView({
  boardUrl,
  tries,
  wrong,
  finished,
  reveal,
}: {
  // The image with n squares clear
  boardUrl: (n: number) => string;
  tries: number;
  // Wrong guesses so far
  wrong: number;
  finished: boolean;
  // The whole image, once the day or round is over
  reveal?: string | undefined;
}) {
  const { shown, left } = blurProgress(wrong, tries, finished);
  const whole = finished && reveal ? reveal : null;
  const src = whole ?? boardUrl(shown);
  return (
    <div id="blur-view" className="mb-6 flex flex-col items-center gap-3">
      <div className="aspect-square w-full max-w-sm overflow-hidden rounded-xl border bg-muted shadow-sm">
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
      </div>
      <p id="blur-tries" className="text-sm font-medium text-muted-foreground">
        {finished
          ? `${tries} ${tries === 1 ? "try" : "tries"}`
          : `${shown} of ${CELLS} squares clear · ${left} ${left === 1 ? "try" : "tries"} left`}
      </p>
    </div>
  );
}

// A Blur game's guesses, newest first: names only, green for the answer, red otherwise
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
            className={cn(
              "guess-result-cell animate-in rounded-lg px-3 py-2.5 text-center font-bold text-white",
              right ? "correct bg-correct" : "incorrect bg-incorrect",
            )}
          >
            {String(cell.value)}
          </li>
        );
      })}
    </ol>
  );
}
