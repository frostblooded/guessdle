// The guess board: a title row and graded rows of tiles, shared by Play and How to play.
import type { ComponentProps, ReactNode } from "react";
import { correctnessClass } from "../game/correctness.ts";
import type { Hint } from "../game/correctness.ts";
import type { BoardColumn, GradedAttribute } from "../game/game.ts";
import { cn } from "../lib/utils.ts";

// A grade class (correctnessClass) to its background
export const TILE_COLORS: Record<string, string> = {
  correct: "bg-correct",
  "partially-correct": "bg-partial",
  incorrect: "bg-incorrect",
};

// A grid row: a narrow square column per picture (`images`, one flag per column), the others
// sharing the rest equally
export function BoardRow({
  images,
  className,
  style,
  ...props
}: ComponentProps<"div"> & { images: readonly boolean[] }) {
  return (
    <div
      className={cn(
        "row grid gap-1.5 [--photo:3rem] sm:gap-2 sm:[--photo:4.5rem]",
        className,
      )}
      style={{
        gridTemplateColumns: images
          .map((image) => (image ? "var(--photo)" : "minmax(0, 1fr)"))
          .join(" "),
        ...style,
      }}
      {...props}
    />
  );
}

const tileBase =
  "cell flex min-h-12 items-center justify-center rounded-lg px-1 py-1.5 text-center text-xs leading-tight font-semibold [overflow-wrap:anywhere] sm:min-h-16 sm:px-2 sm:text-base";

export function TitleTile({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        tileBase,
        "min-h-0 bg-tile py-2 text-xs text-white sm:min-h-0",
        className,
      )}
      {...props}
    />
  );
}

// The board's title row: one dark tile per column
export function TitleRow({ columns }: { columns: readonly BoardColumn[] }) {
  return (
    <BoardRow
      id="guess-results-titles-row"
      images={columns.map((column) => column.image)}
      aria-hidden="true"
    >
      {columns.map((column, i) => (
        <TitleTile key={i} className="guess-result-title">
          {column.title}
        </TitleTile>
      ))}
    </BoardRow>
  );
}

export function PhotoTile({ src }: { src: string }) {
  return (
    <div className={cn(tileBase, "overflow-hidden bg-muted p-0 sm:p-0")}>
      {src && (
        <img
          className="aspect-square size-full object-cover"
          src={src}
          alt=""
        />
      )}
    </div>
  );
}

// A graded tile: green, orange or red with white text
export function GradeTile({
  grade,
  children,
}: {
  grade: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        tileBase,
        "guess-result-cell font-bold text-white",
        grade,
        TILE_COLORS[grade],
      )}
    >
      {children}
    </div>
  );
}

const HINTS: Record<Hint, { arrow: string; label: string }> = {
  higher: { arrow: "↑", label: "The answer is higher" },
  lower: { arrow: "↓", label: "The answer is lower" },
};

// A wrong Number's arrow: which way the answer lies
export function HintArrow({ hint }: { hint: Hint }) {
  const { arrow, label } = HINTS[hint];
  return (
    <span
      className="hint ml-1 text-base sm:text-xl"
      data-hint={hint}
      title={label}
    >
      <span aria-hidden="true">{arrow}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

// One guessed entry: its pictures as they are, then each graded value
export function GuessRow({ row }: { row: GradedAttribute[] }) {
  return (
    <BoardRow
      images={row.map((cell) => cell.image === true)}
      className="guess-result-row animate-in"
    >
      {row.map(({ key, value, correctness, hint, image }) =>
        image ? (
          <PhotoTile key={key} src={value as string} />
        ) : (
          <GradeTile key={key} grade={correctnessClass(correctness)}>
            {Array.isArray(value) ? value.join(", ") : value}
            {hint && <HintArrow hint={hint} />}
          </GradeTile>
        ),
      )}
    </BoardRow>
  );
}
