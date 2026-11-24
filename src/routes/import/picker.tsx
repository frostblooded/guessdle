import { useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { Alert } from "../../components/ui/alert.tsx";
import { Button, buttonVariants } from "../../components/ui/button.tsx";
import { Input, Label, NativeSelect } from "../../components/ui/input.tsx";
import {
  categoriesOf,
  guessType,
  importBody,
  importFileOf,
  problems,
  type Picks,
  type WikiRow,
} from "../../game/wiki-pick.ts";
import { useOnce, useWhile } from "../../lib/effects.ts";
import { wait, wikiFetch } from "../../lib/api.ts";
import { api, errorText, type Reply } from "../../manage-client.ts";
import { CategoryCards } from "./category-cards.tsx";
import { RowsTable } from "./rows-table.tsx";
import {
  listOf,
  pageUrl,
  readList,
  readPage,
  type RowsFrom,
} from "./wikipedia.ts";

const WORKERS = 4;
const NO_PICKS: Picks = { on: [], types: {}, edits: {}, names: {}, crops: {} };

interface Progress {
  phase: "idle" | "list" | "pages" | "done" | "error";
  done: number;
  total: number;
  skipped: string[];
  failed: string[];
  source: string;
}

const START: Progress = {
  phase: "idle",
  done: 0,
  total: 0,
  skipped: [],
  failed: [],
  source: "",
};

interface ImportResult {
  added: number;
  filled: number;
  unchanged: number;
  missingImages: number;
}

const count = (n: number, one: string, many: string): string =>
  `${n} ${n === 1 ? one : many}`;

export const importSummary = (r: ImportResult): string =>
  [
    `Added ${count(r.added, "entry", "entries")}`,
    r.filled > 0 && `filled blanks on ${r.filled}`,
    r.unchanged > 0 && `${r.unchanged} already complete`,
    r.missingImages > 0 &&
      `${count(r.missingImages, "picture", "pictures")} could not be copied`,
  ]
    .filter(Boolean)
    .join(", ") + ".";

const few = (titles: string[]): string =>
  `${titles.slice(0, 5).join(", ")}${titles.length > 5 ? ", …" : ""}`;

function progressText(p: Progress): string {
  if (p.phase === "list") {
    return "Reading the list page…";
  }
  if (p.phase === "error") {
    return "Could not read that list. Check the link and press Read again.";
  }
  return [
    `${p.done} of ${p.total} pages read`,
    p.skipped.length > 0 &&
      `${p.skipped.length} without an infobox (${few(p.skipped)})`,
    p.failed.length > 0 &&
      `${p.failed.length} could not be read (${few(p.failed)}); press Read again to retry`,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function Picker({ base, editHref }: { base: string; editHref: string }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [link, setLink] = useState(params.get("list") ?? "");
  const [from, setFrom] = useState<RowsFrom>("auto");
  const [progress, setProgress] = useState<Progress>(START);
  const [rows, setRows] = useState<WikiRow[]>([]);
  const [picks, setPicks] = useState<Picks>(NO_PICKS);
  const [picked, setPicked] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const reading = useRef<AbortController | null>(null);
  useWhile("picker", () => () => reading.current?.abort());

  const sorted = [...rows].sort((a, b) => a.order - b.order);
  const categories = categoriesOf(rows, picks.on);
  const full: Picks = {
    ...picks,
    types: Object.fromEntries(
      categories.map((k) => [k, picks.types[k] ?? guessType(rows, k)]),
    ),
  };
  const blocked = new Set(
    sorted
      .filter((r) => problems(r, sorted, full).length > 0)
      .map((r) => r.order),
  );
  const chosen = picked.filter((order) => !blocked.has(order));
  const active = progress.phase === "list" || progress.phase === "pages";

  const read = async (): Promise<void> => {
    const list = listOf(link);
    if (list === null) {
      setProgress({ ...START, phase: "error" });
      return;
    }
    reading.current?.abort();
    const control = new AbortController();
    reading.current = control;
    setRows([]);
    setPicks(NO_PICKS);
    setPicked([]);
    setError("");
    const source = pageUrl(list.wiki, list.title);
    setProgress({ ...START, phase: "list", source });
    const titles = await readList(wikiFetch, wait, list, from, control.signal);
    if (control.signal.aborted) {
      return;
    }
    if (titles === null || titles.length === 0) {
      setProgress({ ...START, phase: "error", source });
      return;
    }
    setProgress({ ...START, phase: "pages", total: titles.length, source });
    let next = 0;
    const worker = async (): Promise<void> => {
      while (next < titles.length && !control.signal.aborted) {
        const order = next++;
        const title = titles[order]!;
        const got = await readPage(
          wikiFetch,
          wait,
          list.wiki,
          title,
          order,
          control.signal,
        );
        if (control.signal.aborted) {
          return;
        }
        if (typeof got === "object") {
          setRows((before) => [...before, got]);
        }
        setProgress((p) => ({
          ...p,
          done: p.done + 1,
          skipped: got === "no-infobox" ? [...p.skipped, title] : p.skipped,
          failed: got === "failed" ? [...p.failed, title] : p.failed,
        }));
      }
    };
    await Promise.all(Array.from({ length: WORKERS }, worker));
    if (!control.signal.aborted) {
      setProgress((p) => ({ ...p, phase: "done" }));
    }
  };

  useOnce(params.has("list"), () => void read());

  const toggleCategory = (field: string, on: boolean): void =>
    setPicks((p) => ({
      ...p,
      on: on ? [...p.on, field] : p.on.filter((k) => k !== field),
      types: { ...p.types, [field]: full.types[field] ?? "text" },
    }));

  const start = async (): Promise<void> => {
    setBusy(true);
    setError("");
    const file = importFileOf(progress.source, sorted, chosen, full);
    const out = await api<ImportResult>(
      "POST",
      `${base}/import`,
      importBody(file),
    );
    setBusy(false);
    if (out?.status !== 200) {
      setError(errorText(out as Reply | null));
      return;
    }
    void navigate(editHref, {
      state: { tab: "entries", notice: importSummary(out.data) },
    });
  };

  return (
    <div className="space-y-8">
      <form
        id="wiki-source"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          void read();
        }}
        className="space-y-4 rounded-xl border bg-card p-4 sm:p-5"
      >
        <div className="grid gap-4 sm:grid-cols-[minmax(0,4fr)_minmax(0,2fr)_auto] sm:items-end">
          <div className="space-y-2">
            <Label htmlFor="wiki-list">Wikipedia list link</Label>
            <Input
              id="wiki-list"
              value={link}
              placeholder="https://en.wikipedia.org/wiki/List_of_Pixar_films"
              onChange={(event) => setLink(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="wiki-from">Rows from</Label>
            <NativeSelect
              id="wiki-from"
              value={from}
              onChange={(event) => setFrom(event.target.value as RowsFrom)}
            >
              <option value="auto">Tables, else bullets</option>
              <option value="tables">All tables</option>
              <option value="1">Table 1</option>
              <option value="2">Table 2</option>
              <option value="bullets">Bullet lists</option>
            </NativeSelect>
          </div>
          <Button
            id="wiki-read"
            type="submit"
            disabled={active || link.trim() === ""}
          >
            {active
              ? "Reading…"
              : progress.phase === "idle"
                ? "Read Wikipedia"
                : "Read again"}
          </Button>
        </div>
        {progress.phase !== "idle" && (
          <div id="wiki-progress" role="status" className="space-y-2 text-sm">
            <p id="wiki-progress-text">{progressText(progress)}</p>
            {progress.total > 0 && (
              <div className="h-2.5 overflow-hidden rounded-full border bg-secondary">
                <div
                  className="h-full bg-primary transition-[width]"
                  style={{
                    width: `${(progress.done / progress.total) * 100}%`,
                  }}
                />
              </div>
            )}
            {active && progress.total > 0 && (
              <p className="text-muted-foreground">
                Rows appear below as they arrive; you can start ticking now.
                Leaving this page stops the read.
              </p>
            )}
          </div>
        )}
      </form>

      {rows.length > 0 && (
        <>
          <CategoryCards
            rows={rows}
            categories={categories}
            picks={full}
            onToggle={toggleCategory}
            onType={(field, type) =>
              setPicks((p) => ({ ...p, types: { ...p.types, [field]: type } }))
            }
          />
          <RowsTable
            rows={sorted}
            picks={full}
            setPicks={setPicks}
            picked={chosen}
            blocked={blocked}
            setPicked={setPicked}
          />
        </>
      )}

      {rows.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 px-4 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
            <p id="wiki-sum" className="text-sm">
              <b>{chosen.length}</b> of {sorted.length - blocked.size}{" "}
              importable rows ticked · <b>{picks.on.length}</b> categories
            </p>
            <div className="flex flex-wrap gap-2">
              <Link
                id="wiki-cancel"
                className={buttonVariants({ variant: "ghost" })}
                to={editHref}
              >
                Cancel
              </Link>
              <Button
                id="wiki-import"
                disabled={busy || chosen.length === 0}
                onClick={() => void start()}
              >
                {busy
                  ? "Importing, copying pictures…"
                  : chosen.length > 0
                    ? `Import ${count(chosen.length, "entry", "entries")}`
                    : "Import entries"}
              </Button>
            </div>
          </div>
          <Alert
            id="wiki-error"
            variant="error"
            role="alert"
            className="mx-auto mt-2 max-w-5xl"
          >
            {error}
          </Alert>
        </div>
      )}
    </div>
  );
}
