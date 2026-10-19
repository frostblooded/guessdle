// The editor's photos for one Sequence game entry (ADR 0020): one slot per photo, in the order
// players see them. Each slot crops its upload to 16:9; an entry needs every slot filled to be
// a day's answer.
import { ImagePlus, X } from "lucide-react";
import { useId } from "react";
import { Button } from "../../components/ui/button.tsx";
import { slotCount } from "../../game/sequence.ts";
import { IMAGE_TYPES } from "./types.ts";

export function ShotsEditor({
  shots,
  count,
  onUpload,
  onChange,
}: {
  // "" for an empty slot
  shots: readonly string[];
  // The game's photos per entry
  count: number;
  // Crops and uploads the file; resolves to its URL, or null after a cancel or a failure
  onUpload: (file: File) => Promise<string | null>;
  onChange: (shots: string[]) => void;
}) {
  const id = useId();
  const slots = slotCount(shots, count);
  const set = (slot: number, url: string): void => {
    const next = Array.from({ length: slots }, (_, i) => shots[i] ?? "");
    next[slot] = url;
    // Trailing empty slots are not stored
    while (next.length > 0 && next.at(-1) === "") {
      next.pop();
    }
    onChange(next);
  };
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Photos</p>
      <p className="text-sm text-muted-foreground">
        Players see photo 1 first and one more after each wrong guess or skip,
        so start hard and end easy.
      </p>
      <ol id="shots" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {Array.from({ length: slots }, (_, slot) => {
          const shot = shots[slot] ?? "";
          const input = `${id}-shot-${slot}`;
          return (
            <li key={slot} className="shot-slot space-y-1" data-slot={slot}>
              <div className="relative aspect-video overflow-hidden rounded-md border bg-muted">
                {shot ? (
                  <img
                    className="size-full object-cover"
                    src={shot}
                    alt={`Photo ${slot + 1}`}
                  />
                ) : (
                  <label
                    htmlFor={input}
                    className="flex size-full cursor-pointer flex-col items-center justify-center gap-1 text-sm text-muted-foreground hover:bg-muted/60"
                  >
                    <ImagePlus className="size-5" aria-hidden="true" />
                    Add photo
                  </label>
                )}
                <span className="absolute top-1 left-1 rounded bg-black/60 px-1.5 text-xs font-bold text-white">
                  {slot + 1}
                </span>
                {slot >= count && (
                  <span className="absolute right-1 bottom-1 rounded bg-black/60 px-1.5 text-xs text-white">
                    Not shown
                  </span>
                )}
              </div>
              <input
                type="file"
                id={input}
                accept={IMAGE_TYPES}
                className="sr-only"
                aria-label={`Photo ${slot + 1}`}
                onChange={(event) => {
                  const target = event.target;
                  const file = target.files?.[0];
                  target.value = "";
                  if (file) {
                    void onUpload(file).then((url) => url && set(slot, url));
                  }
                }}
              />
              {shot && (
                <div className="flex gap-1">
                  <label
                    htmlFor={input}
                    className="cursor-pointer text-xs font-medium underline-offset-2 hover:underline"
                  >
                    Replace
                  </label>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto h-auto p-0 text-xs"
                    aria-label={`Remove photo ${slot + 1}`}
                    onClick={() => set(slot, "")}
                  >
                    <X className="size-3" aria-hidden="true" />
                    Remove
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
