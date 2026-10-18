// Zoom games (ADR 0019): players guess an entry from square zoomed-in parts of its image, closest
// first. Each wrong guess shows the next part; a wrong guess on the last part loses the day.
// Pure, so the server, the editor and Play share it.
import { MAX_ZOOM_PARTS, MIN_ZOOM_PART } from "./limits.ts";

export type GameKind = "classic" | "zoom";

export const isGameKind = (value: unknown): value is GameKind =>
  value === "classic" || value === "zoom";

// A square in the entry image's own pixels: its top-left corner and side
export interface ZoomPart {
  x: number;
  y: number;
  size: number;
}

export interface ImageSize {
  width: number;
  height: number;
}

export const isPartCount = (value: unknown): value is number =>
  Number.isInteger(value) &&
  (value as number) >= 1 &&
  (value as number) <= MAX_ZOOM_PARTS;

// A part list as sent by the editor, or undefined when malformed (bounds are checked against the image later)
export function parsePartList(value: unknown): ZoomPart[] | undefined {
  if (!Array.isArray(value) || value.length > MAX_ZOOM_PARTS) {
    return undefined;
  }
  const parts = value.map((item: unknown): ZoomPart | undefined => {
    const { x, y, size } = (item ?? {}) as Record<string, unknown>;
    return [x, y, size].every(Number.isInteger)
      ? { x: x as number, y: y as number, size: size as number }
      : undefined;
  });
  return parts.every((p) => p !== undefined) ? parts : undefined;
}

// Every part lies inside the image and is at least MIN_ZOOM_PART wide
export const partsFit = (
  parts: readonly ZoomPart[],
  { width, height }: ImageSize,
): boolean =>
  parts.every(
    (p) =>
      p.size >= MIN_ZOOM_PART &&
      p.x >= 0 &&
      p.y >= 0 &&
      p.x + p.size <= width &&
      p.y + p.size <= height,
  );

// A starting layout for a fresh image: squares round the centre, from a close zoom (part 1)
// out to the largest square that fits
export function defaultParts(count: number, size: ImageSize): ZoomPart[] {
  const side = Math.min(size.width, size.height);
  const smallest = Math.max(MIN_ZOOM_PART, Math.round(side * 0.15));
  return Array.from({ length: count }, (_, i) => {
    const t = count === 1 ? 1 : i / (count - 1);
    const s = Math.min(side, Math.round(smallest + (side - smallest) * t));
    return {
      x: Math.round((size.width - s) / 2),
      y: Math.round((size.height - s) / 2),
      size: s,
    };
  });
}

// Exactly `count` parts: the first ones kept (clamped into the image), the rest from the
// default layout
export function fillParts(
  parts: readonly ZoomPart[],
  count: number,
  size: ImageSize,
): ZoomPart[] {
  const defaults = defaultParts(count, size);
  return defaults.map((d, i) => (parts[i] ? clampPart(parts[i], size) : d));
}

// Moves and resizes a part so it stays a square inside the image
export function clampPart(part: ZoomPart, size: ImageSize): ZoomPart {
  const s = Math.round(
    Math.min(Math.max(part.size, MIN_ZOOM_PART), size.width, size.height),
  );
  const clamp = (v: number, max: number): number =>
    Math.round(Math.min(Math.max(v, 0), max));
  return {
    x: clamp(part.x, size.width - s),
    y: clamp(part.y, size.height - s),
    size: s,
  };
}

// Where a player is in the day: wrong guesses so far against the game's tries (its part count)
export interface ZoomProgress {
  // Parts the player may see now, 1..tries
  shown: number;
  // Tries left before the day is lost
  left: number;
  lost: boolean;
}

export function zoomProgress(
  wrong: number,
  tries: number,
  finished: boolean,
): ZoomProgress {
  const lost = wrong >= tries;
  return {
    shown: finished || lost ? tries : Math.min(wrong + 1, tries),
    left: Math.max(0, tries - wrong),
    lost,
  };
}
