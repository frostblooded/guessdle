// The editor's Entries tab: list, add, change and delete entries with photo and values (a Blur
// game's image and square order, a Sequence game's photos).
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useCrop } from "../../components/crop-dialog.tsx";
import { CELLS, type GameKind } from "../../game/blur.ts";
import type { ImageKind } from "../../game/crop.ts";
import { FAILURES } from "../../game/failures.ts";
import { Alert } from "../../components/ui/alert.tsx";
import { Button, buttonVariants } from "../../components/ui/button.tsx";
import { Input, Label, Textarea } from "../../components/ui/input.tsx";
import {
  MAX_ENTRY_NAME,
  MAX_LIST_ITEMS,
  MAX_VALUE_LENGTH,
  MIN_ENTRIES,
} from "../../game/limits.ts";
import { api, errorText, type Reply } from "../../manage-client.ts";
import { cn } from "../../lib/utils.ts";
import {
  IMAGE_TYPES,
  isIncomplete,
  thumbOf,
  type Attribute,
  type Entry,
} from "./types.ts";
import { BlurOrderEditor } from "./blur-order-editor.tsx";
import { ShotsEditor } from "./shots-editor.tsx";

// What the form holds: the entry being edited (null: adding), its name, photo URL and values
interface Draft {
  editing: Entry | null;
  name: string;
  photo: string;
  values: Record<string, string>;
  // Blur games: the squares picked so far, in the order they clear
  blurOrder: number[];
  // Sequence games: the photos, "" for an empty slot
  shots: string[];
}

const draftOf = (entry: Entry | null): Draft => ({
  editing: entry,
  name: entry?.name ?? "",
  photo: entry?.photo ?? "",
  blurOrder: entry?.blurOrder ?? [],
  shots: entry?.shots ?? [],
  values: Object.fromEntries(
    Object.entries(entry?.values ?? {}).map(([id, items]) => [
      id,
      items.join("\n"),
    ]),
  ),
});

export function EntriesPanel({
  base,
  initial,
  active,
  kind = "classic",
  tries = 0,
  onChange,
}: {
  base: string;
  // A Blur game's entries have an image and a square order instead of values, a Sequence
  // game's its `tries` photos
  kind?: GameKind;
  tries?: number;
  initial: { attributes: Attribute[]; entries: Entry[] };
  // The tab is open: refresh the lists, since attributes may have changed
  active: boolean;
  // Runs after every saved change, so the page can refresh its status line
  onChange: () => Promise<void>;
}) {
  const [entries, setEntries] = useState(initial.entries);
  const [draft, setDraft] = useState<Draft>(() => draftOf(null));
  const [error, setError] = useState("");
  // The attributes the form was built for; the ref lets the refresh compare without re-running
  const [formAttributes, setFormAttributes] = useState(initial.attributes);
  const built = useRef(initial.attributes);
  const { crop, dialog } = useCrop(setError);
  const blur = kind === "blur";
  const sequence = kind === "sequence";

  useEffect(() => {
    if (!active) {
      return;
    }
    void (async () => {
      const [attrs, got] = await Promise.all([
        api<Attribute[]>("GET", `${base}/attributes`),
        api<Entry[]>("GET", `${base}/entries`),
      ]);
      if (attrs?.status !== 200 || got?.status !== 200) {
        setError(errorText((attrs ?? got) as Reply | null));
        return;
      }
      setError("");
      setEntries(got.data);
      // Opening the tab refreshes while the user may already be typing: keep the form unless the attributes changed
      if (JSON.stringify(built.current) !== JSON.stringify(attrs.data)) {
        built.current = attrs.data;
        setFormAttributes(attrs.data);
        setDraft(draftOf(null));
      }
    })();
  }, [active, base]);

  // Runs a call that answers with the entry list; false when it was refused
  const run = async (
    method: "POST" | "PATCH" | "DELETE",
    path: string,
    body?: unknown,
  ): Promise<boolean> => {
    setError("");
    const out = await api<Entry[]>(method, path, body);
    if (out?.status !== 200) {
      setError(errorText(out as Reply | null));
      return false;
    }
    setEntries(out.data);
    setDraft((d) =>
      d.editing && !out.data.some((e) => e.id === d.editing?.id)
        ? draftOf(null)
        : d,
    );
    await onChange();
    return true;
  };

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    const values = Object.fromEntries(
      formAttributes.map((attr) => [
        String(attr.id),
        (draft.values[String(attr.id)] ?? "").split("\n"),
      ]),
    );
    if (blur && draft.photo && draft.blurOrder.length !== CELLS) {
      setError(FAILURES.missing_order.text);
      return;
    }
    const body = sequence
      ? { name: draft.name, shots: draft.shots }
      : blur
        ? {
            name: draft.name,
            photo: draft.photo,
            ...(draft.blurOrder.length === CELLS && {
              blurOrder: draft.blurOrder,
            }),
          }
        : { name: draft.name, photo: draft.photo, values };
    const ok = draft.editing
      ? await run("PATCH", `${base}/entries/${draft.editing.id}`, body)
      : await run("POST", `${base}/entries`, body);
    if (ok) {
      setDraft(draftOf(null));
    }
  };

  // Crops and uploads the file; its URL, or null after a cancel or a failure
  const uploadFile = async (
    file: File,
    shape: ImageKind,
  ): Promise<string | null> => {
    setError("");
    const cropped = await crop(file, shape);
    if (!cropped) {
      return null;
    }
    const up = await api<{ url?: string }>(
      "POST",
      `/api/uploads?kind=${shape}`,
      cropped,
    );
    const url = up?.status === 200 ? up.data.url : undefined;
    if (!url) {
      setError(errorText(up));
    }
    return url ?? null;
  };

  const upload = async (input: HTMLInputElement): Promise<void> => {
    const file = input.files?.[0];
    input.value = "";
    const url = file && (await uploadFile(file, "photo"));
    if (url) {
      setDraft((d) => ({ ...d, photo: url }));
    }
  };

  return (
    <div className="space-y-5">
      {dialog}
      {sequence ? (
        <p className="lede text-sm text-muted-foreground">
          Each entry is one possible answer, shown to players as {tries} photos,
          one at a time. An entry missing photos can still be guessed but is
          never a day's answer. A game needs at least {MIN_ENTRIES} entries
          before anyone can play it.
        </p>
      ) : (
        <p className="lede text-sm text-muted-foreground">
          {blur
            ? "Each entry is one possible answer."
            : "Each entry is a row on the board."}{" "}
          A game needs at least {MIN_ENTRIES} entries before anyone can play it,
          and every entry needs{" "}
          {blur
            ? "an image and the order its nine squares clear in."
            : "a value for every attribute."}
        </p>
      )}
      <ul
        id="entry-list"
        className="attr-list divide-y rounded-lg border empty:hidden"
      >
        {entries.map((entry) => (
          <li
            key={entry.id}
            className="attr-row flex items-center gap-3 px-3 py-2"
          >
            {thumbOf(entry) ? (
              <img
                className={cn(
                  "entry-thumb h-10 shrink-0 rounded-md object-cover",
                  sequence ? "aspect-video" : "w-10",
                )}
                src={thumbOf(entry)}
                alt=""
              />
            ) : (
              <span
                className="size-10 shrink-0 rounded-md bg-muted"
                aria-hidden="true"
              />
            )}
            <span className="entry-name min-w-0 flex-1 truncate font-medium">
              {entry.name}
            </span>
            {isIncomplete(entry, kind, tries, formAttributes) && (
              <span
                className={cn(
                  "entry-missing shrink-0 text-sm font-medium",
                  sequence ? "text-muted-foreground" : "text-error",
                )}
              >
                {sequence
                  ? "Missing photos: guess only"
                  : blur
                    ? "Missing image or order"
                    : "Missing values"}
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              aria-label={`Edit ${entry.name}`}
              onClick={() => setDraft(draftOf(entry))}
            >
              Edit
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Delete ${entry.name}`}
              onClick={() => {
                if (
                  confirm(
                    `Delete "${entry.name}"? It leaves the board; past guesses keep working.`,
                  )
                ) {
                  void run("DELETE", `${base}/entries/${entry.id}`);
                }
              }}
            >
              Delete
            </Button>
          </li>
        ))}
      </ul>
      <form
        id="entry-form"
        className="space-y-4 rounded-lg border bg-muted/40 p-4"
        noValidate
        onSubmit={(event) => void submit(event)}
      >
        <h3 className="font-semibold">
          {draft.editing ? `Edit ${draft.editing.name}` : "New entry"}
        </h3>
        <div className="space-y-2">
          <Label htmlFor="entry-name">Name</Label>
          <Input
            id="entry-name"
            maxLength={MAX_ENTRY_NAME}
            autoComplete="off"
            value={draft.name}
            onChange={(event) =>
              setDraft((d) => ({ ...d, name: event.target.value }))
            }
          />
        </div>
        {sequence && (
          <ShotsEditor
            shots={draft.shots}
            count={tries}
            onUpload={(file) => uploadFile(file, "shot")}
            onChange={(shots) => setDraft((d) => ({ ...d, shots }))}
          />
        )}
        <div className="space-y-2" hidden={sequence}>
          <p className="text-sm font-medium">{blur ? "Image" : "Photo"}</p>
          {blur && !draft.photo && (
            <p className="text-sm text-muted-foreground">
              Players see this image split into nine squares, all blurred but
              one, and the whole image once the day is over.
            </p>
          )}
          {blur && draft.photo && (
            <BlurOrderEditor
              src={draft.photo}
              order={draft.blurOrder}
              onChange={(blurOrder) => setDraft((d) => ({ ...d, blurOrder }))}
            />
          )}
          {!blur && draft.photo && (
            <img
              id="entry-photo-preview"
              className="cover-preview size-24 rounded-lg object-cover"
              src={draft.photo}
              alt=""
            />
          )}
          <div className="flex flex-wrap gap-2">
            <input
              type="file"
              id="entry-photo"
              accept={IMAGE_TYPES}
              className="sr-only"
              onChange={(event) => void upload(event.target)}
            />
            <label
              className={buttonVariants({ variant: "outline", size: "sm" })}
              htmlFor="entry-photo"
            >
              {blur ? "Choose image" : "Choose photo"}
            </label>
            {!blur && (
              <Button
                id="entry-photo-remove"
                variant="ghost"
                size="sm"
                onClick={() => setDraft((d) => ({ ...d, photo: "" }))}
              >
                Remove photo
              </Button>
            )}
          </div>
        </div>
        <div id="entry-fields" className="space-y-4 empty:hidden">
          {formAttributes.map((attr) => {
            const id = `entry-attr-${attr.id}`;
            const value = draft.values[String(attr.id)] ?? "";
            const set = (text: string): void =>
              setDraft((d) => ({
                ...d,
                values: { ...d.values, [String(attr.id)]: text },
              }));
            return (
              <div key={attr.id} className="space-y-2">
                <Label htmlFor={id}>
                  {attr.type === "list"
                    ? `${attr.name} (one per line)`
                    : attr.type === "number"
                      ? `${attr.name} (number)`
                      : attr.name}
                </Label>
                {attr.type === "list" ? (
                  <Textarea
                    id={id}
                    required
                    rows={3}
                    maxLength={MAX_VALUE_LENGTH * MAX_LIST_ITEMS}
                    value={value}
                    onChange={(event) => set(event.target.value)}
                  />
                ) : (
                  <Input
                    id={id}
                    required
                    inputMode={attr.type === "number" ? "decimal" : undefined}
                    maxLength={MAX_VALUE_LENGTH}
                    value={value.split("\n")[0]}
                    onChange={(event) => set(event.target.value)}
                  />
                )}
              </div>
            );
          })}
        </div>
        <Alert id="entry-error" variant="error" role="alert">
          {error}
        </Alert>
        <div className="flex flex-wrap gap-2">
          <Button id="entry-submit" type="submit">
            {draft.editing ? "Save entry" : "Add entry"}
          </Button>
          {draft.editing && (
            <Button
              id="entry-cancel"
              variant="ghost"
              onClick={() => setDraft(draftOf(null))}
            >
              Cancel
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
