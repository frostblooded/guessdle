import { useState, type ChangeEvent } from "react";
import { Upload } from "lucide-react";
import { Alert } from "../../components/ui/alert.tsx";
import { Button } from "../../components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "../../components/ui/dialog.tsx";
import { Label, Textarea } from "../../components/ui/input.tsx";
import { parseImportFile, type ImportFile } from "../../game/import-file.ts";
import { api, errorText, type Reply } from "../../manage-client.ts";

interface ImportResult {
  added: number;
  filled: number;
  unchanged: number;
  missingImages: number;
}

const TYPE_NAMES = { text: "Text", list: "List", number: "Number" } as const;

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

function readFile(text: string): ImportFile | null | undefined {
  if (text.trim() === "") {
    return null;
  }
  try {
    return parseImportFile(JSON.parse(text));
  } catch {
    return undefined;
  }
}

export function ImportButton({
  base,
  onImported,
}: {
  base: string;
  onImported: (summary: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const file = readFile(text);

  const choose = async (event: ChangeEvent<HTMLInputElement>) => {
    const picked = event.target.files?.[0];
    if (picked) {
      setText(await picked.text());
    }
  };

  const start = async () => {
    if (!file) {
      return;
    }
    setBusy(true);
    setError("");
    const out = await api<ImportResult>(
      "POST",
      `${base}/import`,
      JSON.parse(text),
    );
    setBusy(false);
    if (out?.status !== 200) {
      setError(errorText(out as Reply | null));
      return;
    }
    setOpen(false);
    setText("");
    await onImported(importSummary(out.data));
  };

  return (
    <>
      <Button
        id="import-open"
        variant="outline"
        onClick={() => {
          setError("");
          setOpen(true);
        }}
      >
        <Upload aria-hidden="true" />
        Import entries
      </Button>
      <Dialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
        <DialogContent
          id="import-dialog"
          className="max-w-lg"
          aria-describedby="import-lede"
        >
          <DialogTitle className="pr-8 text-xl">Import entries</DialogTitle>
          <div className="space-y-4">
            <p id="import-lede" className="text-sm text-muted-foreground">
              Paste the import file copied from the Game Data Picker, or choose
              the saved file. New attributes are added, new entries are created,
              and entries that already exist only get their blank values filled.
            </p>
            <div className="space-y-2">
              <Label htmlFor="import-text">Import file</Label>
              <Textarea
                id="import-text"
                rows={6}
                className="font-mono text-xs"
                value={text}
                disabled={busy}
                onChange={(event) => setText(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="import-file">Or choose a file</Label>
              <input
                id="import-file"
                type="file"
                accept=".json,application/json"
                disabled={busy}
                className="block w-full text-sm"
                onChange={(event) => void choose(event)}
              />
            </div>
            {file && (
              <Alert id="import-preview" variant="info">
                {count(file.entries.length, "entry", "entries")} with{" "}
                {file.attributes
                  .map((a) => `${a.name} (${TYPE_NAMES[a.type]})`)
                  .join(", ") || "no attributes"}
                {file.entries.some((e) => e.image) && ", plus pictures"}.
              </Alert>
            )}
            <Alert id="import-error" variant="error" role="alert">
              {file === undefined
                ? "This is not a Guessdle import file, or it is broken."
                : error}
            </Alert>
            <div className="flex flex-wrap gap-2">
              <Button
                id="import-submit"
                disabled={!file || busy}
                onClick={() => void start()}
              >
                {busy ? "Importing, copying pictures…" : "Import"}
              </Button>
              <Button
                id="import-cancel"
                variant="ghost"
                disabled={busy}
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
