import { useState, type Dispatch, type SetStateAction } from "react";
import { Button } from "../../components/ui/button.tsx";
import { Input, Textarea } from "../../components/ui/input.tsx";
import { selectOnMount } from "../../lib/effects.ts";
import { cn } from "../../lib/utils.ts";
import {
  asList,
  cellKey,
  cropOf,
  importValues,
  nameOf,
  numberIn,
  problems,
  rawValue,
  type Picks,
  type WikiRow,
} from "../../game/wiki-pick.ts";
import { CropDialog } from "./crop-dialog.tsx";

const NAME = "\u0001name";

const shownNumber = (x: number): string =>
  Math.abs(x) >= 1e6
    ? `${(x / 1e6).toLocaleString()} million`
    : x.toLocaleString();

function Value({
  row,
  field,
  picks,
}: {
  row: WikiRow;
  field: string;
  picks: Picks;
}) {
  const raw = rawValue(row, field, picks);
  if (raw === null) {
    return <span className="text-warn italic">not on page · add</span>;
  }
  const values = importValues(row, field, picks);
  if (picks.types[field] === "number") {
    return values === null ? (
      <span className="text-warn italic">no number in "{raw.join(", ")}"</span>
    ) : (
      <>
        <b>{shownNumber(numberIn(values[0]!)!)}</b>
        <span className="block text-xs text-muted-foreground">
          {raw.join(", ")}
        </span>
      </>
    );
  }
  if (picks.types[field] === "list") {
    return (
      <span className="flex flex-wrap gap-1">
        {values!.map((v, i) => (
          <span key={i} className="rounded border bg-secondary px-1.5">
            {v}
          </span>
        ))}
      </span>
    );
  }
  return <>{values![0]}</>;
}

function Editor({
  initial,
  multi,
  label,
  onSave,
  onCancel,
}: {
  initial: string;
  multi: boolean;
  label: string;
  onSave: (text: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(initial);
  return (
    <form
      className="grid min-w-44 gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(text);
      }}
      onKeyDown={(event) => event.key === "Escape" && onCancel()}
    >
      {multi ? (
        <Textarea
          aria-label={label}
          rows={Math.min(8, Math.max(3, text.split("\n").length))}
          value={text}
          ref={selectOnMount}
          onChange={(event) => setText(event.target.value)}
        />
      ) : (
        <Input
          aria-label={label}
          value={text}
          ref={selectOnMount}
          onChange={(event) => setText(event.target.value)}
        />
      )}
      <span className="flex gap-2">
        <Button size="sm" type="submit">
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </span>
    </form>
  );
}

function Picture({
  row,
  picks,
  onEdit,
}: {
  row: WikiRow;
  picks: Picks;
  onEdit: () => void;
}) {
  const crop = cropOf(row, picks);
  if (!row.thumb || !crop) {
    return (
      <span className="grid size-16 place-items-center rounded-md border border-dashed bg-secondary text-center text-[10px] text-muted-foreground">
        no picture
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onEdit}
      aria-label={`Edit picture of ${nameOf(row, picks)}`}
      className="group relative block size-16 cursor-pointer overflow-hidden rounded-md bg-secondary bg-no-repeat"
      style={{
        backgroundImage: `url("${row.thumb}")`,
        backgroundSize: `${100 / crop.width}% ${100 / crop.height}%`,
        backgroundPosition: `${crop.width < 1 ? (crop.left / (1 - crop.width)) * 100 : 0}% ${crop.height < 1 ? (crop.top / (1 - crop.height)) * 100 : 0}%`,
      }}
    >
      <span className="absolute inset-0 grid place-items-end justify-center bg-black/45 pb-1.5 text-xs font-bold text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
        Edit
      </span>
    </button>
  );
}

export function RowsTable({
  rows,
  picks,
  setPicks,
  picked,
  blocked,
  setPicked,
}: {
  rows: WikiRow[];
  picks: Picks;
  setPicks: Dispatch<SetStateAction<Picks>>;
  picked: number[];
  blocked: Set<number>;
  setPicked: Dispatch<SetStateAction<number[]>>;
}) {
  const [filter, setFilter] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [cropping, setCropping] = useState<WikiRow | null>(null);
  const shown = rows.filter((r) =>
    nameOf(r, picks).toLowerCase().includes(filter.trim().toLowerCase()),
  );

  const saveName = (row: WikiRow, text: string): void => {
    const name = text.trim();
    setPicks((p) => {
      const names = { ...p.names };
      if (name === row.name) {
        delete names[row.order];
      } else {
        names[row.order] = name;
      }
      return { ...p, names };
    });
    setEditing(null);
  };

  const saveValue = (row: WikiRow, field: string, text: string): void => {
    const list = picks.types[field] === "list";
    const items = (list ? text.split("\n") : [text])
      .map((x) => x.trim())
      .filter(Boolean);
    const original = field in row.fields ? asList(row.fields[field]!) : null;
    const same =
      original !== null &&
      JSON.stringify(list ? original : [original.join(", ")]) ===
        JSON.stringify(items);
    setPicks((p) => {
      const edits = { ...p.edits };
      if (items.length === 0 || same) {
        delete edits[cellKey(row.order, field)];
      } else {
        edits[cellKey(row.order, field)] = items;
      }
      return { ...p, edits };
    });
    setEditing(null);
  };

  const undo = (row: WikiRow, field: string): void =>
    setPicks((p) => {
      const edits = { ...p.edits };
      delete edits[cellKey(row.order, field)];
      return { ...p, edits };
    });

  return (
    <section aria-labelledby="wiki-rows-title" className="space-y-3">
      <div className="space-y-1">
        <h2 id="wiki-rows-title" className="text-lg font-bold">
          Rows
        </h2>
        <p className="text-sm text-muted-foreground">
          Click a value or press rename to correct it; edited values are marked
          and can be undone. Hover a picture and click Edit to pick the square
          that gets imported.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Input
          type="search"
          aria-label="Filter rows by name"
          placeholder="Filter by name"
          className="min-w-0 flex-1 basis-52"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
        <Button
          id="wiki-tick-all"
          variant="outline"
          onClick={() =>
            setPicked(
              rows.filter((r) => !blocked.has(r.order)).map((r) => r.order),
            )
          }
        >
          Tick all importable
        </Button>
        <Button variant="outline" onClick={() => setPicked([])}>
          Untick all
        </Button>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table id="wiki-rows" className="w-full text-sm">
          <thead className="bg-primary text-left text-primary-foreground">
            <tr>
              <th className="px-3 py-2">Import</th>
              <th className="px-3 py-2">Picture</th>
              <th className="px-3 py-2">Name</th>
              {picks.on.map((field) => (
                <th key={field} className="px-3 py-2 whitespace-nowrap">
                  {field}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => {
              const bad = problems(row, rows, picks);
              const on = picked.includes(row.order);
              const name = nameOf(row, picks);
              return (
                <tr
                  key={row.order}
                  className={cn(
                    "border-t align-top",
                    bad.length > 0 && "bg-secondary/60 text-muted-foreground",
                    on && "bg-success-bg",
                  )}
                >
                  <td className="w-px px-3 py-2">
                    <input
                      type="checkbox"
                      className="size-5 accent-primary"
                      aria-label={`Import ${name}`}
                      checked={on}
                      disabled={bad.length > 0}
                      onChange={(event) =>
                        setPicked((p) =>
                          event.target.checked
                            ? [...p, row.order]
                            : p.filter((o) => o !== row.order),
                        )
                      }
                    />
                  </td>
                  <td className="w-px px-3 py-2">
                    <Picture
                      row={row}
                      picks={picks}
                      onEdit={() => setCropping(row)}
                    />
                  </td>
                  <td className="min-w-36 px-3 py-2 font-bold">
                    {editing === cellKey(row.order, NAME) ? (
                      <Editor
                        initial={name}
                        multi={false}
                        label={`Name of ${row.name}`}
                        onSave={(text) => saveName(row, text)}
                        onCancel={() => setEditing(null)}
                      />
                    ) : (
                      <>
                        <a
                          href={row.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline-offset-4 hover:underline"
                        >
                          {name}
                        </a>
                        <button
                          type="button"
                          className="ml-2 cursor-pointer text-xs font-normal text-muted-foreground underline"
                          onClick={() => setEditing(cellKey(row.order, NAME))}
                        >
                          rename
                        </button>
                        {name !== row.title && (
                          <small className="block font-normal text-muted-foreground">
                            Wikipedia: {row.title}
                          </small>
                        )}
                        {bad.length > 0 && (
                          <small className="block font-normal text-warn">
                            {bad.join("; ")}
                          </small>
                        )}
                      </>
                    )}
                  </td>
                  {picks.on.map((field) => {
                    const key = cellKey(row.order, field);
                    const raw = rawValue(row, field, picks) ?? [];
                    const list = picks.types[field] === "list";
                    return (
                      <td key={field} className="max-w-64 min-w-36 px-3 py-2">
                        {editing === key ? (
                          <Editor
                            initial={raw.join(list ? "\n" : ", ")}
                            multi={list}
                            label={`${field} of ${name}`}
                            onSave={(text) => saveValue(row, field, text)}
                            onCancel={() => setEditing(null)}
                          />
                        ) : (
                          <>
                            <button
                              type="button"
                              aria-label={`Edit ${field} of ${name}`}
                              className="-m-1 block w-full cursor-text rounded p-1 text-left hover:bg-secondary"
                              onClick={() => setEditing(key)}
                            >
                              <Value row={row} field={field} picks={picks} />
                            </button>
                            {picks.edits[key] && (
                              <span className="mt-1 inline-block text-xs text-success">
                                edited
                                <button
                                  type="button"
                                  className="ml-1.5 cursor-pointer underline"
                                  onClick={() => undo(row, field)}
                                >
                                  undo
                                </button>
                              </span>
                            )}
                          </>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {cropping && (
        <CropDialog
          row={cropping}
          crop={cropOf(cropping, picks)!}
          name={nameOf(cropping, picks)}
          onClose={() => setCropping(null)}
          onSave={(crop) => {
            setPicks((p) => ({
              ...p,
              crops: { ...p.crops, [cropping.order]: crop },
            }));
            setCropping(null);
          }}
        />
      )}
    </section>
  );
}
