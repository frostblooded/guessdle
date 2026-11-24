import { NativeSelect } from "../../components/ui/input.tsx";
import type { ImportAttributeType } from "../../game/import-file.ts";
import { cn } from "../../lib/utils.ts";
import {
  asList,
  coverage,
  MAX_PICKED_CATEGORIES,
  type Picks,
  type WikiRow,
} from "../../game/wiki-pick.ts";

const TYPES: [ImportAttributeType, string][] = [
  ["text", "Text"],
  ["list", "List"],
  ["number", "Number"],
];

export function CategoryCards({
  rows,
  categories,
  picks,
  onToggle,
  onType,
}: {
  rows: WikiRow[];
  categories: string[];
  picks: Picks;
  onToggle: (field: string, on: boolean) => void;
  onType: (field: string, type: ImportAttributeType) => void;
}) {
  const counts = coverage(rows);
  const full = picks.on.length >= MAX_PICKED_CATEGORIES;
  const sample = (field: string): string =>
    asList(rows.find((r) => field in r.fields)!.fields[field]!).join(", ");
  return (
    <section aria-labelledby="wiki-categories-title" className="space-y-3">
      <div className="space-y-1">
        <h2 id="wiki-categories-title" className="text-lg font-bold">
          Categories
        </h2>
        <p className="text-sm text-muted-foreground">
          Fields found in the infobox cards of these pages, with how many pages
          have each. Tick the ones to import as attributes (up to{" "}
          {MAX_PICKED_CATEGORIES}; pictures go in their own Photo column). Rows
          missing a ticked field can't be imported, since every value must be
          filled.
        </p>
      </div>
      <ul
        id="wiki-categories"
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        {categories.map((field, i) => {
          const on = picks.on.includes(field);
          const id = `wiki-cat-${i}`;
          return (
            <li
              key={field}
              className={cn(
                "grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 rounded-lg border bg-card p-3",
                on && "border-primary bg-secondary",
                full && !on && "opacity-60",
              )}
            >
              <input
                id={id}
                type="checkbox"
                aria-label={field}
                className="mt-0.5 size-5 accent-primary"
                checked={on}
                disabled={full && !on}
                onChange={(event) => onToggle(field, event.target.checked)}
              />
              <label htmlFor={id} className="min-w-0 cursor-pointer space-y-1">
                <span className="flex justify-between gap-2 font-bold">
                  <span className="wrap-anywhere">{field}</span>
                  <span
                    className={cn(
                      "text-xs font-normal whitespace-nowrap text-muted-foreground",
                      counts[field]! < rows.length && "text-warn",
                    )}
                  >
                    {counts[field]}/{rows.length}
                  </span>
                </span>
                <span
                  className="block truncate text-xs text-muted-foreground"
                  title={sample(field)}
                >
                  e.g. {sample(field)}
                </span>
              </label>
              <NativeSelect
                aria-label={`Type for ${field}`}
                className="col-start-2 h-8 py-0 text-sm"
                value={picks.types[field]}
                onChange={(event) =>
                  onType(field, event.target.value as ImportAttributeType)
                }
              >
                {TYPES.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
