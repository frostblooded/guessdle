// Upload pipeline: type by magic bytes, resize, re-encode to WebP, random-hex file names.
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const MAX_SIDE = { photo: 800, cover: 1200 };
// Decompression-bomb guard; sharp's default is 268 MP
const MAX_PIXELS = 50_000_000;

export type ImageKind = keyof typeof MAX_SIDE;
export const isImageKind = (value: unknown): value is ImageKind =>
  value === "photo" || value === "cover";

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
      .resize(MAX_SIDE[kind], MAX_SIDE[kind], {
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp()
      .toBuffer();
  } catch {
    throw new ImageError("corrupt");
  }
}

// Processes and stores an upload; returns its public URL path
export async function saveUpload(
  dir: string,
  input: Buffer,
  kind: ImageKind,
): Promise<string> {
  const webp = await processImage(input, kind);
  const name = `${randomBytes(16).toString("hex")}.webp`;
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, name), webp);
  return `/uploads/${name}`;
}
