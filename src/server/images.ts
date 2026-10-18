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
