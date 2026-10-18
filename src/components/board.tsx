// The guess board: a title row and graded rows of tiles, shared by Play and How to play.
import type { ComponentProps, CSSProperties, ReactNode } from "react";
import { correctnessClass } from "../game/correctness.ts";
import type { GradedAttribute } from "../game/game.ts";
import { cn } from "../lib/utils.ts";

const TILE_COLORS: Record<string, string> = {
  correct: "bg-correct",
  "partially-correct": "bg-partial",
  incorrect: "bg-incorrect",
};

// A grid row: the photo column, then one equal column per name and attribute
export function BoardRow({
  columns,
  className,
  style,
  ...props
}: ComponentProps<"div"> & { columns: number }) {
  return (
    <div
      className={cn(
        "row grid gap-1.5 [--photo:3rem] sm:gap-2 sm:[--photo:4.5rem]",
        className,
      )}
      style={{
        gridTemplateColumns: `var(--photo) repeat(${columns - 1}, minmax(0, 1fr))`,
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

export function PhotoTile({ src, alt = "" }: { src: string; alt?: string }) {
  return (
    <div className={cn(tileBase, "overflow-hidden bg-muted p-0 sm:p-0")}>
      {src && (
        <img
          className="aspect-square size-full object-cover"
          src={src}
          alt={alt}
        />
      )}
    </div>
  );
}

// A graded tile: green, orange or red with white text
export function GradeTile({
  grade,
  className,
  children,
}: {
  grade: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        tileBase,
        "guess-result-cell font-bold text-white",
        grade,
        TILE_COLORS[grade],
        className,
      )}
    >
      {children}
    </div>
  );
}

// One guessed entry: its photo, then each graded value
export function GuessRow({
  row,
  style,
}: {
  row: GradedAttribute[];
  style?: CSSProperties;
}) {
  return (
    <BoardRow
      columns={row.length}
      className="guess-result-row animate-in"
      style={style}
    >
      {row.map(({ key, value, correctness }, i) =>
        i === 0 ? (
          <PhotoTile key={key} src={value as string} />
        ) : (
          <GradeTile key={key} grade={correctnessClass(correctness)}>
            {Array.isArray(value) ? value.join(", ") : value}
          </GradeTile>
        ),
      )}
    </BoardRow>
  );
}
