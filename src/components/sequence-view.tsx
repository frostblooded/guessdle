// A Sequence game's photos (ADR 0020), shared by Play and party rounds: the photos unlocked so
// far, newest first on screen, with numbered buttons to look back at earlier ones. Every photo
// unlocks once the day or round is over.
import { Lock } from "lucide-react";
import { useState } from "react";
import { blurProgress } from "../game/blur.ts";
import { cn } from "../lib/utils.ts";

export function SequenceView({
  shotUrl,
  tries,
  wrong,
  finished,
}: {
  // Photo n of the answer, 1-based
  shotUrl: (n: number) => string;
  tries: number;
  // Wrong guesses and skips so far
  wrong: number;
  finished: boolean;
}) {
  const { shown: unlocked, left } = blurProgress(wrong, tries, finished);
  // The photo the player looked back at, while no newer one has unlocked since
  const [picked, setPicked] = useState<{ n: number; at: number } | null>(null);
  const current = picked?.at === unlocked ? picked.n : unlocked;
  return (
    <div id="sequence-view" className="mb-6 flex flex-col items-center gap-3">
      <div className="aspect-video w-full max-w-2xl overflow-hidden rounded-xl border bg-muted shadow-sm">
        <img
          id="sequence-current"
          key={current}
          className="animate-in size-full object-cover"
          src={shotUrl(current)}
          alt={`Photo ${current} of ${tries}`}
        />
      </div>
      <div
        className="flex flex-wrap justify-center gap-1.5"
        role="group"
        aria-label="Photos"
      >
        {Array.from({ length: tries }, (_, i) => {
          const n = i + 1;
          const open = n <= unlocked;
          return (
            <button
              key={n}
              type="button"
              data-shot={n}
              disabled={!open}
              aria-pressed={n === current}
              aria-label={open ? `Photo ${n}` : `Photo ${n}, locked`}
              className={cn(
                "shot-button flex size-9 items-center justify-center rounded-md border text-sm font-bold transition-colors",
                n === current
                  ? "border-primary bg-primary text-primary-foreground"
                  : open
                    ? "bg-card hover:bg-muted"
                    : "cursor-not-allowed bg-muted text-muted-foreground opacity-60",
              )}
              onClick={() => setPicked({ n, at: unlocked })}
            >
              {open ? n : <Lock className="size-3.5" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
      <p
        id="sequence-tries"
        className="text-sm font-medium text-muted-foreground"
      >
        {finished
          ? `${tries} ${tries === 1 ? "photo" : "photos"}`
          : `Photo ${unlocked} of ${tries} · ${left} ${left === 1 ? "try" : "tries"} left`}
      </p>
    </div>
  );
}
