// The practice game's guess input: every pet as a small tappable card. Pets already guessed are
// disabled; pets the clues have ruled out are faded but still tappable. Picture rounds hide the
// photos, which would give the secret away.
import { PICK_GRID, PickCard } from "../../components/pick-card.tsx";
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
    <ul className={cn("pet-picker", PICK_GRID)} aria-label="Pets to guess">
      {entries.map((entry) => {
        const used = guessed.has(entry.id);
        const out = !used && fitting !== null && !fitting.has(entry.id);
        return (
          <li key={entry.id}>
            <PickCard
              name={entry.name}
              photo={entry.photo}
              struck={out}
              className={cn("pet-option", out && "ruled-out opacity-45")}
              pictures={photos}
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
            />
          </li>
        );
      })}
    </ul>
  );
}
