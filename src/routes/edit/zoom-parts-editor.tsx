// The editor's zoomed parts for one Zoom game entry (ADR 0019): square boxes on the entry's image,
// numbered in the order players see them. Drag a box to move it, its corner handle (or the size
// slider) to resize it.
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { cn } from "../../lib/utils.ts";
import { MIN_ZOOM_PART } from "../../game/limits.ts";
import {
  clampPart,
  fillParts,
  type ImageSize,
  type ZoomPart,
} from "../../game/zoom.ts";

// What one drag started from, in image pixels
interface Drag {
  mode: "move" | "resize";
  pointerX: number;
  pointerY: number;
  start: ZoomPart;
}

// The part as the player sees it: the square of the image, filling the frame
export function PartPreview({
  src,
  part,
  size,
  className,
}: {
  src: string;
  part: ZoomPart;
  size: ImageSize;
  className?: string;
}) {
  const pct = (v: number): string => `${(v / part.size) * 100}%`;
  return (
    <div
      className={cn(
        "relative aspect-square overflow-hidden rounded-lg bg-muted",
        className,
      )}
    >
      <img
        className="absolute max-w-none"
        src={src}
        alt=""
        draggable={false}
        style={{
          width: pct(size.width),
          height: pct(size.height),
          left: pct(-part.x),
          top: pct(-part.y),
        }}
      />
    </div>
  );
}

export function ZoomPartsEditor({
  src,
  parts,
  count,
  onChange,
}: {
  src: string;
  parts: readonly ZoomPart[];
  count: number;
  onChange: (parts: ZoomPart[]) => void;
}) {
  const [size, setSize] = useState<ImageSize | null>(null);
  const [selected, setSelected] = useState(0);
  const frame = useRef<HTMLDivElement | null>(null);
  const drag = useRef<Drag | null>(null);

  // A fresh image, or a new part count: fill in the missing parts from the default layout
  useEffect(() => {
    if (size && parts.length !== count) {
      onChange(fillParts(parts, count, size));
    }
  }, [size, parts, count, onChange]);

  // Image pixels per screen pixel
  const scale = (): number =>
    size && frame.current
      ? size.width / frame.current.getBoundingClientRect().width
      : 1;

  const set = (i: number, part: ZoomPart): void => {
    if (!size) {
      return;
    }
    onChange(parts.map((p, j) => (j === i ? clampPart(part, size) : p)));
  };

  const start = (
    event: PointerEvent<HTMLElement>,
    i: number,
    mode: Drag["mode"],
  ): void => {
    event.preventDefault();
    event.stopPropagation();
    setSelected(i);
    frame.current?.setPointerCapture(event.pointerId);
    drag.current = {
      mode,
      pointerX: event.clientX,
      pointerY: event.clientY,
      start: parts[i]!,
    };
  };

  const move = (event: PointerEvent<HTMLDivElement>): void => {
    const d = drag.current;
    if (!d) {
      return;
    }
    const dx = (event.clientX - d.pointerX) * scale();
    const dy = (event.clientY - d.pointerY) * scale();
    set(
      selected,
      d.mode === "move"
        ? { ...d.start, x: d.start.x + dx, y: d.start.y + dy }
        : { ...d.start, size: d.start.size + Math.max(dx, dy) },
    );
  };

  const end = (): void => {
    drag.current = null;
  };

  const ready = size !== null && parts.length === count;
  const pct = (v: number, of: number): string => `${(v / of) * 100}%`;
  const current = ready ? parts[Math.min(selected, count - 1)] : undefined;
  const largest = size ? Math.min(size.width, size.height) : MIN_ZOOM_PART;

  return (
    <div id="zoom-parts" className="space-y-3">
      <div
        ref={frame}
        className="relative mx-auto w-fit max-w-full touch-none overflow-hidden rounded-lg border bg-muted select-none"
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      >
        <img
          id="zoom-image"
          className="block max-h-[60vh] w-auto max-w-full"
          src={src}
          alt=""
          draggable={false}
          onLoad={(event) => {
            const img = event.currentTarget;
            const natural = {
              width: img.naturalWidth,
              height: img.naturalHeight,
            };
            setSize(natural);
          }}
        />
        {ready &&
          parts.map((p, i) => (
            <div
              key={i}
              data-part={i + 1}
              className={cn(
                "zoom-box absolute cursor-move rounded-sm border-2 shadow-[0_0_0_1px_rgba(0,0,0,0.5)]",
                i === selected
                  ? "z-10 border-white bg-white/10"
                  : "border-white/60",
              )}
              style={{
                left: pct(p.x, size.width),
                top: pct(p.y, size.height),
                width: pct(p.size, size.width),
                height: pct(p.size, size.height),
              }}
              onPointerDown={(event) => start(event, i, "move")}
            >
              <span className="absolute top-0 left-0 rounded-br-sm bg-black/70 px-1.5 text-xs font-bold text-white">
                {i + 1}
              </span>
              {i === selected && (
                <span
                  className="absolute -right-2 -bottom-2 size-5 cursor-nwse-resize rounded-full border-2 border-white bg-primary"
                  aria-hidden="true"
                  onPointerDown={(event) => start(event, i, "resize")}
                />
              )}
            </div>
          ))}
      </div>
      {ready && current && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="flex-1 space-y-3">
            <div
              className="flex flex-wrap gap-1.5"
              role="group"
              aria-label="Zoomed parts"
            >
              {parts.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  id={`zoom-part-${i + 1}`}
                  aria-pressed={i === selected}
                  className={cn(
                    "size-9 rounded-md border text-sm font-bold",
                    i === selected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "bg-card",
                  )}
                  onClick={() => setSelected(i)}
                >
                  {i + 1}
                </button>
              ))}
            </div>
            <label className="block space-y-1 text-sm">
              <span className="font-medium">Part {selected + 1} size</span>
              <input
                id="zoom-part-size"
                type="range"
                className="block w-full accent-primary"
                min={MIN_ZOOM_PART}
                max={largest}
                value={current.size}
                onChange={(event) => {
                  // Grow or shrink round the centre
                  const s = Number(event.target.value);
                  const half = (current.size - s) / 2;
                  set(selected, {
                    x: current.x + half,
                    y: current.y + half,
                    size: s,
                  });
                }}
              />
            </label>
            <p className="text-sm text-muted-foreground">
              Part 1 is shown first, so make it the closest zoom. Each wrong
              guess shows the next part.
            </p>
          </div>
          <PartPreview
            src={src}
            part={current}
            size={size}
            className="w-32 shrink-0 self-center sm:w-36 sm:self-start"
          />
        </div>
      )}
    </div>
  );
}
