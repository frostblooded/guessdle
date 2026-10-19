// One tappable entry card, its picture and name: selection mode's list and How to play's pet
// picker both use it, so the two always look the same.
import type { ComponentProps } from "react";
import { cn } from "../lib/utils.ts";

// The cards' grid: 3 to a row on a phone, 5 on wider screens
export const PICK_GRID = "grid grid-cols-3 gap-1.5 sm:grid-cols-5 sm:gap-2";

export function PickCard({
  name,
  photo,
  pictures = true,
  struck = false,
  className,
  ...props
}: ComponentProps<"button"> & {
  name: string;
  photo: string;
  // False for a list with no pictures at all (a Blur or Sequence game, whose pictures are the
  // answers): then the card shows the name alone
  pictures?: boolean;
  // Crossed out: How to play's pets that no longer fit the clues
  struck?: boolean;
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex min-h-[46px] w-full cursor-pointer items-center gap-2 rounded-lg border bg-card p-1 text-left text-sm font-semibold transition hover:border-primary hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-default disabled:opacity-40 sm:min-h-[50px]",
        !pictures && "px-3",
        className,
      )}
      {...props}
    >
      {pictures && (
        <span className="size-9 shrink-0 overflow-hidden rounded-md bg-muted sm:size-10">
          {photo && (
            <img
              className="size-full object-cover"
              src={photo}
              alt=""
              loading="lazy"
            />
          )}
        </span>
      )}
      <span className={cn("min-w-0 truncate", struck && "line-through")}>
        {name}
      </span>
    </button>
  );
}
