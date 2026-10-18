// The result card above the guesses after a win, a give-up or (Zoom games) running out of tries.
import type { EntryRef } from "../../game/game.ts";

export type Result = {
  kind: "victory" | "give-up" | "lost";
  answer: string;
  // A Zoom game's answer image, which its roster does not carry
  photo?: string | undefined;
} | null;

const TITLES = {
  victory: "You did it!",
  "give-up": "Better luck tomorrow",
  lost: "Out of tries",
} as const;

// The result card above the guesses: the answer's photo and name
export function ResultBanner({
  result,
  roster,
}: {
  result: NonNullable<Result>;
  roster: readonly EntryRef[];
}) {
  const victory = result.kind === "victory";
  const photo =
    result.photo ??
    roster.find((entry) => entry.name === result.answer)?.photo;
  return (
    <div
      id={victory ? "victory-title" : "give-up-title"}
      className={`banner banner-${result.kind === "lost" ? "give-up" : result.kind} animate-in mb-6 flex flex-col items-center gap-3 text-center sm:flex-row sm:justify-center sm:gap-5 sm:text-left ${
        victory ? "text-success" : "text-foreground"
      }`}
    >
      {photo && (
        <img
          className="size-16 shrink-0 rounded-lg object-cover sm:size-20"
          src={photo}
          alt=""
        />
      )}
      <div className="flex min-w-0 flex-col gap-1">
        <strong className="text-3xl font-bold uppercase sm:text-5xl">
          {TITLES[result.kind]}
        </strong>
        <span className="break-words">
          {victory ? "The answer is " : "The answer was "}
          <span
            id={victory ? "victory-answer-name" : "give-up-answer-name"}
            className="font-semibold"
          >
            {result.answer}
          </span>
        </span>
      </div>
    </div>
  );
}
