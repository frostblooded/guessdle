// Selection mode's list of every entry not guessed yet, shown above the board so the guesses stay
// in view: a name filter, then the entries as picture-and-name cards in a window three rows tall
// that scrolls. Tapping a card guesses it at once.
import { useState } from "react";
import { PICK_GRID, PickCard } from "../../components/pick-card.tsx";
import { Input } from "../../components/ui/input.tsx";
import type { EntryRef } from "../../game/game.ts";
import { filterByName } from "../../game/guess-mode.ts";

export function SelectList({
  entries,
  onPick,
}: {
  // The entries not guessed yet
  entries: readonly EntryRef[];
  onPick: (name: string) => void;
}) {
  const [filter, setFilter] = useState("");
  const shown = filterByName(entries, filter);
  // A Blur or Sequence game sends no pictures (they are its answers): names only
  const pictures = entries.some((entry) => entry.photo !== "");

  return (
    <div id="select-list" className="mb-6 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Input
          id="select-filter"
          aria-label="Filter by name"
          placeholder="Filter by name"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          value={filter}
          onChange={(event) => setFilter(event.currentTarget.value)}
        />
        <span
          id="select-count"
          className="shrink-0 text-sm whitespace-nowrap text-muted-foreground"
        >
          {shown.length} of {entries.length}
        </span>
      </div>
      {/* Three rows of cards (46px, 50px from sm) with their gaps and padding, so the fourth row's
          top edge peeks out to show the list scrolls */}
      <div className="max-h-[162px] overflow-y-auto rounded-lg border bg-card p-1 sm:max-h-[180px]">
        <ul aria-label="Entries" className={PICK_GRID}>
          {shown.map((entry) => (
            <li key={entry.id}>
              <PickCard
                name={entry.name}
                photo={entry.photo}
                pictures={pictures}
                className="select-option"
                aria-label={`Guess ${entry.name}`}
                onClick={() => onPick(entry.name)}
              />
            </li>
          ))}
          {shown.length === 0 && (
            <li className="col-span-full px-3 py-3 text-center text-sm text-muted-foreground">
              No names match &quot;{filter}&quot;.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
