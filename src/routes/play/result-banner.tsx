// The result card above the guesses after a win or a give-up.
import type { EntryRef } from "../../game/game.ts";

export type Result = { kind: "victory" | "give-up"; answer: string } | null;

// The result card above the guesses: the answer's photo and name
export function ResultBanner({
  result,
  roster,
}: {
  result: NonNullable<Result>;
  roster: readonly EntryRef[];
}) {
  const victory = result.kind === "victory";
  const photo = roster.find((entry) => entry.name === result.answer)?.photo;
  return (
    <div
      id={victory ? "victory-title" : "give-up-title"}
      className={`banner banner-${result.kind} animate-in mb-6 flex flex-col items-center gap-3 text-center sm:flex-row sm:justify-center sm:gap-5 sm:text-left ${
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
          {victory ? "You did it!" : "Better luck tomorrow"}
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
