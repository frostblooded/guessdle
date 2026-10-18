// Upload pipeline: type by magic bytes, resize, re-encode to WebP, random-hex file names.
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import {
  type ImageKind,
  MAX_UPLOAD_BYTES,
  UPLOAD_SHAPES,
} from "../game/crop.ts";
import { cellRect } from "../game/blur.ts";

export { type ImageKind, isImageKind, MAX_UPLOAD_BYTES } from "../game/crop.ts";

// Decompression-bomb guard; sharp's default is 268 MP
const MAX_PIXELS = 50_000_000;

export class ImageError extends Error {
  readonly code: "unsupported" | "too_large" | "corrupt";
  constructor(code: "unsupported" | "too_large" | "corrupt") {
    super(code);
    this.code = code;
  }
}

const startsWith = (buf: Buffer, ...bytes: number[]): boolean =>
  bytes.every((b, i) => buf[i] === b);

const isSupported = (buf: Buffer): boolean =>
  startsWith(buf, 0xff, 0xd8, 0xff) || // JPEG
  startsWith(buf, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a) || // PNG
  (buf.toString("latin1", 0, 4) === "RIFF" &&
    buf.toString("latin1", 8, 12) === "WEBP");

// The upload as a clean WebP: pixels only, so appended payloads and metadata are gone
export async function processImage(
  input: Buffer,
  kind: ImageKind,
): Promise<Buffer> {
  if (input.length > MAX_UPLOAD_BYTES) {
    throw new ImageError("too_large");
  }
  if (!isSupported(input)) {
    throw new ImageError("unsupported");
  }
  try {
    return await sharp(input, { limitInputPixels: MAX_PIXELS })
      .rotate()
      .resize(UPLOAD_SHAPES[kind].maxSide, UPLOAD_SHAPES[kind].maxSide, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp()
      .toBuffer();
  } catch {
    throw new ImageError("corrupt");
  }
}

// Stores processed WebP bytes under a random name; returns the public URL path
export async function storeWebp(dir: string, webp: Buffer): Promise<string> {
  const name = `${randomBytes(16).toString("hex")}.webp`;
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, name), webp);
  return `/uploads/${name}`;
}

// The file a stored upload URL names, or null for anything else
const fileOf = (dir: string, url: string): string | null => {
  const name = /^\/uploads\/([0-9a-f]{32}\.webp)$/.exec(url)?.[1];
  return name === undefined ? null : join(dir, name);
};

// How hard the blurred squares are smudged, as a share of the image's side
const BLUR_STRENGTH = 0.06;
const BLUR_CACHE = 200;

// Memoizes an image render by key, keeping the latest `limit` results
function lru(
  limit: number,
): (
  key: string,
  render: () => Promise<Buffer | null>,
) => Promise<Buffer | null> {
  const cache = new Map<string, Promise<Buffer | null>>();
  return (key, render) => {
    const hit = cache.get(key) ?? render();
    cache.delete(key);
    cache.set(key, hit);
    if (cache.size > limit) {
      cache.delete(cache.keys().next().value!);
    }
    return hit;
  };
}

// Renders a Blur game's board (ADR 0019): the stored upload blurred all over, with the first
// `shown` squares of `order` pasted back clear. Keeps the latest boards in memory.
export function blurRenderer(dir: string) {
  const cached = lru(BLUR_CACHE);
  const render = async (
    url: string,
    cells: readonly number[],
  ): Promise<Buffer | null> => {
    const file = fileOf(dir, url);
    if (!file) {
      return null;
    }
    try {
      const { width, height } = await sharp(file).metadata();
      if (!width || !height) {
        return null;
      }
      const clear = await Promise.all(
        cells.map(async (cell) => {
          const rect = cellRect(cell, width, height);
          return {
            input: await sharp(file).extract(rect).toBuffer(),
            left: rect.left,
            top: rect.top,
          };
        }),
      );
      const sigma = Math.max(1, Math.min(width, height) * BLUR_STRENGTH);
      return await sharp(file).blur(sigma).composite(clear).webp().toBuffer();
    } catch {
      return null;
    }
  };
  return (url: string, cells: readonly number[]): Promise<Buffer | null> =>
    cached(`${url}:${cells.join(",")}`, () => render(url, cells));
}

// A gallery banner tile's side, and how hard it is blurred: enough that no answer shows
const TILE_SIDE = 240;
const TILE_BLUR = 18;

// Renders a stored upload as a small, heavily blurred square for a Blur game's gallery banner
export function tileRenderer(dir: string) {
  const cached = lru(BLUR_CACHE);
  return (url: string): Promise<Buffer | null> =>
    cached(url, async () => {
      const file = fileOf(dir, url);
      try {
        return file
          ? await sharp(file)
              .resize(TILE_SIDE, TILE_SIDE, { fit: "cover" })
              .blur(TILE_BLUR)
              .webp()
              .toBuffer()
          : null;
      } catch {
        return null;
      }
    });
}
