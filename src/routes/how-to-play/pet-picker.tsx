// The practice game's guess input: every pet as a small tappable card. Pets already guessed are
// disabled; pets the clues have ruled out are faded but still tappable. Picture rounds hide the
// photos, which would give the secret away.
import type { Entry } from "../../game/game.ts";
import { cn } from "../../lib/utils.ts";

export function PetPicker({
  entries,
  guessed,
  fitting,
  onPick,
  photos = true,
}: {
  entries: readonly Entry[];
  guessed: ReadonlySet<number>;
  // Ids that still fit every clue; null fades nothing
  fitting: ReadonlySet<number> | null;
  onPick: (entry: Entry) => void;
  photos?: boolean;
}) {
  return (
    <ul
      className="pet-picker grid grid-cols-3 gap-1.5 sm:grid-cols-5 sm:gap-2"
      aria-label="Pets to guess"
    >
      {entries.map((entry) => {
        const used = guessed.has(entry.id);
        const out = !used && fitting !== null && !fitting.has(entry.id);
        return (
          <li key={entry.id}>
            <button
              type="button"
              className={cn(
                "pet-option flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-lg border bg-card p-1 text-left text-sm font-semibold transition hover:border-primary hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-default disabled:opacity-40",
                out && "ruled-out opacity-45",
                !photos && "px-3",
              )}
              disabled={used}
              data-fits={fitting === null || used ? undefined : String(!out)}
              aria-label={
                used
                  ? `${entry.name}, already guessed`
                  : out
                    ? `${entry.name}, does not fit your clues`
                    : entry.name
              }
              onClick={() => onPick(entry)}
            >
              {photos && (
                <span className="size-9 shrink-0 overflow-hidden rounded-md bg-muted sm:size-10">
                  {entry.photo && (
                    <img
                      className="size-full object-cover"
                      src={entry.photo}
                      alt=""
                      loading="lazy"
                    />
                  )}
                </span>
              )}
              <span className={cn("min-w-0 truncate", out && "line-through")}>
                {entry.name}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
