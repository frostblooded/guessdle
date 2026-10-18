// Selection mode's list of every entry not guessed yet, shown in place of the board: a name filter,
// sortable column titles and one compact row per entry. Tapping a row guesses it at once.
import { useState } from "react";
import { Input } from "../../components/ui/input.tsx";
import {
  cellText,
  listEntries,
  nextSort,
  type ListEntry,
  type ListSort,
} from "../../game/guess-mode.ts";
import { boardColumns, type GameAttribute } from "../../game/game.ts";
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

// An Image column's title: not sortable, and small enough for the picture column
function ImageTitle({ label }: { label: string }) {
  return (
    <div
      className={cn(
        cellBase,
        "min-h-0 truncate bg-tile px-0.5 py-2 text-[0.625rem] font-semibold text-white sm:text-xs",
      )}
      title={label}
    >
      {label}
    </div>
  );
}

export function SelectList({
  entries,
  attributes,
  onPick,
}: {
  // The entries not guessed yet
  entries: readonly ListEntry[];
  // A classic game's attributes; null for a Blur game, which lists names only (its pictures are
  // the answers)
  attributes: readonly GameAttribute[] | null;
  onPick: (name: string) => void;
}) {
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<ListSort>({ column: -1, descending: false });
  const columns = boardColumns(
    attributes ?? [],
    attributes ? "classic" : "blur",
  );
  const shown = listEntries(
    entries,
    (attributes ?? []).map((a) => a.type),
    filter,
    sort,
  );
  const grid = {
    gridTemplateColumns: columns
      .map((column) => (column.image ? "var(--photo)" : "minmax(0, 1fr)"))
      .join(" "),
  };
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
          {columns.map((column, i) =>
            column.image ? (
              <ImageTitle key={i} label={column.title} />
            ) : (
              <SortTitle
                key={i}
                label={column.title}
                column={column.attribute ?? -1}
                sort={sort}
                onSort={onSort}
              />
            ),
          )}
        </div>
        <ul
          aria-label="Entries"
          className={cn(
            "gap-1 p-1 pt-0",
            // Names only (a Blur game): several to a line
            columns.length === 1
              ? "grid grid-cols-2 sm:grid-cols-3"
              : "flex flex-col",
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
                {columns.map((column, i) => {
                  const value =
                    column.attribute === undefined
                      ? entry.name
                      : cellText(entry.values?.[column.attribute]);
                  return column.image ? (
                    <span
                      key={i}
                      className="aspect-square overflow-hidden rounded-md bg-muted"
                    >
                      {value && (
                        <img
                          className="size-full object-cover"
                          src={value}
                          alt=""
                          loading="lazy"
                        />
                      )}
                    </span>
                  ) : (
                    <span
                      key={i}
                      className={cn(
                        cellBase,
                        "bg-muted",
                        column.attribute === undefined && "font-semibold",
                      )}
                    >
                      {value}
                    </span>
                  );
                })}
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
