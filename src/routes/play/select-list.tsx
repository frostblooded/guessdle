// Selection mode's list of every entry not guessed yet, shown in place of the board: a name filter,
// sortable column titles and one compact row per entry. Tapping a row guesses it at once.
import { useState } from "react";
import { boardColumns } from "../../components/board.tsx";
import { Input } from "../../components/ui/input.tsx";
import {
  cellText,
  listEntries,
  nextSort,
  type ListEntry,
  type ListSort,
} from "../../game/guess-mode.ts";
import type { GameAttribute } from "../../game/game.ts";
import { cn } from "../../lib/utils.ts";

const cellBase =
  "flex min-h-10 items-center justify-center rounded-md px-1 py-1 text-center text-xs leading-tight [overflow-wrap:anywhere] sm:text-sm";

function SortTitle({
  label,
  column,
  sort,
  onSort,
}: {
  label: string;
  column: number;
  sort: ListSort;
  onSort: (column: number) => void;
}) {
  const sorted = sort.column === column;
  return (
    <button
      type="button"
      className={cn(
        cellBase,
        "min-h-0 cursor-pointer bg-tile py-2 font-semibold text-white hover:bg-tile/85",
      )}
      aria-label={`Sort by ${label}`}
      aria-pressed={sorted}
      onClick={() => onSort(column)}
    >
      {label}
      {sorted && (
        <span aria-hidden="true" className="ml-1">
          {sort.descending ? "▼" : "▲"}
        </span>
      )}
    </button>
  );
}

export function SelectList({
  entries,
  attributes,
  photos,
  onPick,
}: {
  // The entries not guessed yet
  entries: readonly ListEntry[];
  // A classic game's attributes; a Blur game has none to show
  attributes: readonly GameAttribute[];
  // False for a Blur game: its photos are the answers
  photos: boolean;
  onPick: (name: string) => void;
}) {
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<ListSort>({ column: -1, descending: false });
  const shown = listEntries(
    entries,
    attributes.map((a) => a.type),
    filter,
    sort,
  );
  const columns = (photos ? 2 : 1) + attributes.length;
  // Without the photo column every column is equal
  const grid = photos
    ? boardColumns(columns)
    : { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` };
  const onSort = (column: number): void => setSort(nextSort(sort, column));

  return (
    <div id="select-list" className="flex flex-col gap-2">
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
      <div className="max-h-[70vh] overflow-y-auto rounded-lg border bg-card">
        <div
          className="sticky top-0 z-10 grid gap-1 bg-card p-1 [--photo:2.5rem] sm:[--photo:3rem]"
          style={grid}
        >
          {photos && (
            <div
              className={cn(
                cellBase,
                "min-h-0 bg-tile py-2 font-semibold text-white",
              )}
            >
              Photo
            </div>
          )}
          <SortTitle label="Name" column={-1} sort={sort} onSort={onSort} />
          {attributes.map((attribute, i) => (
            <SortTitle
              key={i}
              label={attribute.name}
              column={i}
              sort={sort}
              onSort={onSort}
            />
          ))}
        </div>
        <ul
          aria-label="Entries"
          className={cn(
            "gap-1 p-1 pt-0",
            // Names only (a Blur game): several to a line
            columns === 1 ? "grid grid-cols-2 sm:grid-cols-3" : "flex flex-col",
          )}
        >
          {shown.map((entry) => (
            <li key={entry.name}>
              <button
                type="button"
                className="select-option grid w-full cursor-pointer gap-1 rounded-md text-foreground [--photo:2.5rem] hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none sm:[--photo:3rem]"
                style={grid}
                aria-label={`Guess ${entry.name}`}
                onClick={() => onPick(entry.name)}
              >
                {photos && (
                  <span className="aspect-square overflow-hidden rounded-md bg-muted">
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
                <span className={cn(cellBase, "bg-muted font-semibold")}>
                  {entry.name}
                </span>
                {attributes.map((_, i) => (
                  <span key={i} className={cn(cellBase, "bg-muted")}>
                    {cellText(entry.values[i])}
                  </span>
                ))}
              </button>
            </li>
          ))}
          {shown.length === 0 && (
            <li className="col-span-full px-3 py-4 text-center text-sm text-muted-foreground">
              No names match &quot;{filter}&quot;.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
