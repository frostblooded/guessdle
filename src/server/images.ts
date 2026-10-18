// Upload pipeline: type by magic bytes, resize, re-encode to WebP, random-hex file names.
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { type ImageKind, MAX_UPLOAD_BYTES, maxSideOf } from "../game/crop.ts";
import type { ImageSize, ZoomPart } from "../game/zoom.ts";

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
      .resize(maxSideOf(kind), maxSideOf(kind), {
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

// The pixel size of a stored upload, null when there is no such readable file
export const imageSizeOf =
  (dir: string) =>
  async (url: string): Promise<ImageSize | null> => {
    const file = fileOf(dir, url);
    try {
      const { width, height } = file ? await sharp(file).metadata() : {};
      return width && height ? { width, height } : null;
    } catch {
      return null;
    }
  };

// The side of a zoomed part as Play shows it: small parts are enlarged to it
export const PART_SIDE = 640;
const PART_CACHE = 200;

// Renders zoomed parts of stored uploads as WebP squares, keeping the latest ones in memory
export function partRenderer(dir: string) {
  const cache = new Map<string, Promise<Buffer | null>>();
  const render = async (url: string, p: ZoomPart): Promise<Buffer | null> => {
    const file = fileOf(dir, url);
    if (!file) {
      return null;
    }
    try {
      return await sharp(file)
        .extract({ left: p.x, top: p.y, width: p.size, height: p.size })
        .resize(PART_SIDE, PART_SIDE, { fit: "fill" })
        .webp()
        .toBuffer();
    } catch {
      return null;
    }
  };
  return (url: string, part: ZoomPart): Promise<Buffer | null> => {
    const key = `${url}:${part.x}:${part.y}:${part.size}`;
    const hit = cache.get(key) ?? render(url, part);
    cache.delete(key);
    cache.set(key, hit);
    if (cache.size > PART_CACHE) {
      cache.delete(cache.keys().next().value!);
    }
    return hit;
  };
}
