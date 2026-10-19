// The editor's Entries tab: list, add, change and delete entries with their values (a Blur
// entry: its image and square order; a Sequence entry: its photos).
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useCrop } from "../../components/crop-dialog.tsx";
import { CELLS, type GameKind } from "../../game/blur.ts";
import type { ImageKind } from "../../game/crop.ts";
import { FAILURES } from "../../game/failures.ts";
import { Alert } from "../../components/ui/alert.tsx";
import { Button } from "../../components/ui/button.tsx";
import { Input, Label, Textarea } from "../../components/ui/input.tsx";
import {
  MAX_DESCRIPTION,
  MAX_ENTRY_NAME,
  MAX_LIST_ITEMS,
  MAX_VALUE_LENGTH,
} from "../../game/limits.ts";
import { api, errorText, type Reply } from "../../manage-client.ts";
import { cn } from "../../lib/utils.ts";
import { isIncomplete, thumbOf, type Attribute, type Entry } from "./types.ts";
import { ImagePicker, ImageValue } from "./image-value.tsx";
import { BlurOrderEditor } from "./blur-order-editor.tsx";
import { EntriesLede } from "./entries-lede.tsx";
import { ShotsEditor } from "./shots-editor.tsx";

// What the form holds: the entry being edited (null: adding), its name, Blur image URL,
// description and values (an Image value is its URL)
interface Draft {
  editing: Entry | null;
  name: string;
  photo: string;
  description: string;
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
  description: entry?.description ?? "",
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

  // Runs a call that answers with the entry list; false when it was refused. `clear` empties
  // the form with the new list, before the page refresh, so nothing typed after it is lost.
  const run = async (
    method: "POST" | "PATCH" | "DELETE",
    path: string,
    body?: unknown,
    clear = false,
  ): Promise<boolean> => {
    setError("");
    const out = await api<Entry[]>(method, path, body);
    if (out?.status !== 200) {
      setError(errorText(out as Reply | null));
      return false;
    }
    setEntries(out.data);
    setDraft((d) =>
      clear || (d.editing && !out.data.some((e) => e.id === d.editing?.id))
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
      ? { name: draft.name, description: draft.description, shots: draft.shots }
      : blur
        ? {
            name: draft.name,
            photo: draft.photo,
            description: draft.description,
            ...(draft.blurOrder.length === CELLS && {
              blurOrder: draft.blurOrder,
            }),
          }
        : { name: draft.name, description: draft.description, values };
    await (draft.editing
      ? run("PATCH", `${base}/entries/${draft.editing.id}`, body, true)
      : run("POST", `${base}/entries`, body, true));
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

  // Uploads the chosen picture, then hands its URL to `done`
  const upload = async (
    input: HTMLInputElement,
    done: (url: string) => void,
  ): Promise<void> => {
    const file = input.files?.[0];
    input.value = "";
    const url = file && (await uploadFile(file, "photo"));
    if (url) {
      done(url);
    }
  };

  return (
    <div className="space-y-5">
      {dialog}
      <EntriesLede kind={kind} tries={tries} />
      <ul
        id="entry-list"
        className="attr-list divide-y rounded-lg border empty:hidden"
      >
        {entries.map((entry) => (
          <li
            key={entry.id}
            className="attr-row flex items-center gap-3 px-3 py-2"
          >
            {thumbOf(entry, formAttributes) ? (
              <img
                className={cn(
                  "entry-thumb h-10 shrink-0 rounded-md object-cover",
                  sequence ? "aspect-video" : "w-10",
                )}
                src={thumbOf(entry, formAttributes)}
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
        {blur && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Image</p>
            {draft.photo ? (
              <BlurOrderEditor
                src={draft.photo}
                order={draft.blurOrder}
                onChange={(blurOrder) => setDraft((d) => ({ ...d, blurOrder }))}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                Players see this image split into nine squares, all blurred but
                one, and the whole image once the day is over.
              </p>
            )}
            <ImagePicker
              id="entry-photo"
              onPick={(input) =>
                void upload(input, (url) =>
                  setDraft((d) => ({ ...d, photo: url })),
                )
              }
            />
          </div>
        )}
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
                {attr.type === "image" ? (
                  <ImageValue
                    id={id}
                    name={attr.name}
                    src={value}
                    onPick={(input) => void upload(input, set)}
                    onRemove={() => set("")}
                  />
                ) : (
                  <Label htmlFor={id}>
                    {attr.type === "list"
                      ? `${attr.name} (one per line)`
                      : attr.type === "number"
                        ? `${attr.name} (number)`
                        : attr.name}
                  </Label>
                )}
                {attr.type === "image" ? null : attr.type === "list" ? (
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
        <div className="space-y-2">
          <Label htmlFor="entry-description">Description (optional)</Label>
          <Textarea
            id="entry-description"
            rows={3}
            maxLength={MAX_DESCRIPTION}
            aria-describedby="entry-description-help"
            value={draft.description}
            onChange={(event) =>
              setDraft((d) => ({ ...d, description: event.target.value }))
            }
          />
          <p
            id="entry-description-help"
            className="text-sm text-muted-foreground"
          >
            {blur
              ? "Shown with the answer once a player finds it or the day is over."
              : "Shown with the answer once a player finds it or the day is over. Players can also reveal it as their free hint."}
          </p>
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
