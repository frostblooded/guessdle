export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export const UPLOAD_SHAPES = {
  photo: { aspect: 1, maxSide: 800 },
  shot: { aspect: 16 / 9, maxSide: 1280 },
  cover: { aspect: 16 / 7, maxSide: 1200 },
} as const;

export type ImageKind = keyof typeof UPLOAD_SHAPES;
export const isImageKind = (value: unknown): value is ImageKind =>
  value === "photo" || value === "shot" || value === "cover";

export interface Size {
  width: number;
  height: number;
}

export function cropOutputSize(
  cropWidth: number,
  aspect: number,
  maxSide: number,
): Size {
  const scale = Math.min(1, maxSide / Math.max(cropWidth, cropWidth / aspect));
  const width = Math.max(1, Math.round(cropWidth * scale));
  return { width, height: Math.max(1, Math.round(width / aspect)) };
}

export interface Rect extends Size {
  x: number;
  y: number;
}

export function clampRect(rect: Rect, bounds: Size, aspect: number): Rect {
  const width = Math.min(rect.width, bounds.width, bounds.height * aspect);
  const height = width / aspect;
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const clamp = (v: number, max: number): number =>
    Math.min(Math.max(v, 0), max);
  return {
    x: clamp(cx - width / 2, bounds.width - width),
    y: clamp(cy - height / 2, bounds.height - height),
    width,
    height,
  };
}

export const sameRect = (a: Rect, b: Rect): boolean =>
  Math.abs(a.x - b.x) < 1e-6 &&
  Math.abs(a.y - b.y) < 1e-6 &&
  Math.abs(a.width - b.width) < 1e-6 &&
  Math.abs(a.height - b.height) < 1e-6;

export async function encodeUnderLimit<T extends { size: number }>(
  encodings: readonly (() => Promise<T | null>)[],
  limit: number = MAX_UPLOAD_BYTES,
): Promise<T | null> {
  for (const encode of encodings) {
    const out = await encode();
    if (out && out.size <= limit) {
      return out;
    }
  }
  return null;
}

export const CROP_FAILURES = {
  undecodable:
    "This browser cannot open that file as an image. Use a JPEG, PNG or WebP image.",
  too_large:
    "The cropped image is still over 5 MB. Crop a smaller area or pick another image.",
} as const;

export class CropError extends Error {
  readonly code: keyof typeof CROP_FAILURES;
  constructor(code: keyof typeof CROP_FAILURES) {
    super(CROP_FAILURES[code]);
    this.code = code;
  }
}
