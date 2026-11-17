import type { ReactNode } from "react";
import type { EntryRef } from "../../game/game.ts";
import type { Reveal } from "../../game/play.ts";

export type Result = {
  kind: "victory" | "give-up" | "lost";
  answer: string;
  photo?: string | undefined;
  description?: string | undefined;
} | null;

export const resultOf = (
  kind: NonNullable<Result>["kind"],
  reveal: Reveal,
): Result => ({
  kind,
  answer: reveal.answer!,
  photo: reveal.answerPhoto,
  description: reveal.answerDescription,
});

const TITLES = {
  victory: "You did it!",
  "give-up": "Better luck tomorrow",
  lost: "Out of tries",
} as const;

export function AnswerDescription({ text }: { text: string }) {
  return (
    <p
      id="answer-description"
      className="text-sm whitespace-pre-line break-words text-foreground"
    >
      {text}
    </p>
  );
}

export function ResultBanner({
  result,
  roster,
  title = TITLES[result.kind],
  children,
}: {
  result: NonNullable<Result>;
  roster: readonly EntryRef[];
  title?: string;
  children?: ReactNode;
}) {
  const victory = result.kind === "victory";
  const photo =
    result.photo ?? roster.find((entry) => entry.name === result.answer)?.photo;
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
          {title}
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
        {children}
        {result.description && <AnswerDescription text={result.description} />}
      </div>
    </div>
  );
}
