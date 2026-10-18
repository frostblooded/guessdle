// A Zoom game's board (ADR 0019), shared by Play and party rounds: the zoomed part in a big
// square frame, the parts seen so far to flip back to, and the whole image once it is over.
import { useState } from "react";
import { cn } from "../lib/utils.ts";
import { Correctness } from "../game/correctness.ts";
import { nameCell, type GradedAttribute } from "../game/game.ts";
import { zoomProgress } from "../game/zoom.ts";

export function ZoomView({
  partUrl,
  tries,
  wrong,
  finished,
  reveal,
}: {
  // Part n's image (1-based)
  partUrl: (n: number) => string;
  tries: number;
  // Wrong guesses so far
  wrong: number;
  finished: boolean;
  // The whole image, once the day or round is over
  reveal?: string | undefined;
}) {
  const { shown, left } = zoomProgress(wrong, tries, finished);
  const whole = finished && reveal ? reveal : null;
  // 1..shown is a part; 0 is the whole image. A new part, or the end, shows at once: a pick
  // only holds while the board it was made on stays.
  const board = `${shown}:${whole ?? ""}`;
  const [picked, setPicked] = useState<{ board: string; n: number } | null>(
    null,
  );
  const viewing =
    picked?.board === board ? picked.n : whole ? 0 : shown;
  const setViewing = (n: number): void => setPicked({ board, n });

  const src = viewing === 0 && whole ? whole : partUrl(Math.max(1, viewing));
  const parts = Array.from({ length: shown }, (_, i) => i + 1);

  return (
    <div id="zoom-view" className="flex flex-col items-center gap-3">
      <div className="aspect-square w-full max-w-sm overflow-hidden rounded-xl border bg-muted shadow-sm">
        <img
          id="zoom-current"
          key={src}
          className={cn(
            "animate-in size-full",
            viewing === 0 ? "object-contain" : "object-cover",
          )}
          src={src}
          alt={viewing === 0 ? "The whole image" : `Zoomed part ${viewing}`}
        />
      </div>
      <p id="zoom-tries" className="text-sm font-medium text-muted-foreground">
        {finished
          ? `${tries} ${tries === 1 ? "part" : "parts"}`
          : `Part ${shown} of ${tries} · ${left} ${left === 1 ? "try" : "tries"} left`}
      </p>
      <div
        className="flex flex-wrap justify-center gap-2"
        role="group"
        aria-label="Parts seen"
      >
        {parts.map((n) => (
          <button
            key={n}
            type="button"
            id={`zoom-thumb-${n}`}
            aria-label={`Part ${n}`}
            aria-pressed={viewing === n}
            className={cn(
              "relative size-12 overflow-hidden rounded-md border-2 sm:size-14",
              viewing === n ? "border-primary" : "border-transparent",
            )}
            onClick={() => setViewing(n)}
          >
            <img className="size-full object-cover" src={partUrl(n)} alt="" />
            <span className="absolute top-0 left-0 rounded-br-sm bg-black/70 px-1 text-[10px] font-bold text-white">
              {n}
            </span>
          </button>
        ))}
        {whole && (
          <button
            type="button"
            id="zoom-thumb-whole"
            aria-label="Whole image"
            aria-pressed={viewing === 0}
            className={cn(
              "size-12 overflow-hidden rounded-md border-2 sm:size-14",
              viewing === 0 ? "border-primary" : "border-transparent",
            )}
            onClick={() => setViewing(0)}
          >
            <img className="size-full object-cover" src={whole} alt="" />
          </button>
        )}
      </div>
    </div>
  );
}

// A Zoom game's guesses, newest first: names only, green for the answer, red otherwise
export function ZoomGuesses({ rows }: { rows: readonly GradedAttribute[][] }) {
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
