// Browser side of cropping an upload (issue #82), with no page or framework in it: load a file,
// mount Cropper.js in a host element, and turn the crop into a file for /api/uploads.
// The editor wraps it in a dialog (src/components/crop-dialog.tsx); the caller revokes the image URL when done.
import "cropperjs";
import type { CropperImage, CropperSelection } from "cropperjs";
import {
  clampRect,
  CropError,
  cropOutputSize,
  encodeUnderLimit,
  type CropKind,
  type Rect,
  sameRect,
  UPLOAD_SHAPES,
} from "./game/crop.ts";

export interface MountedCropper {
  // The cropped file; CropError("too_large") when no encoding fits the upload limit
  crop(): Promise<Blob>;
  zoom(step: number): void;
  destroy(): void;
}

// The file as a decoded image; CropError("undecodable") when it is not an image this browser reads
export async function loadImage(file: Blob): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = URL.createObjectURL(file);
  try {
    await image.decode();
  } catch {
    URL.revokeObjectURL(image.src);
    throw new CropError("undecodable");
  }
  return image;
}

// The image fills the canvas exactly and stays put; only the frame moves and zooms
// (drag, wheel, pinch, corner handles or zoom()).
const template = (aspect: number): string => `
  <cropper-canvas background>
    <cropper-image></cropper-image>
    <cropper-shade theme-color="rgba(0, 0, 0, 0.55)"></cropper-shade>
    <cropper-selection aspect-ratio="${aspect}" initial-coverage="1" precise movable resizable zoomable outlined>
      <cropper-grid role="grid" bordered covered></cropper-grid>
      <cropper-handle action="move" theme-color="transparent"></cropper-handle>
      <cropper-handle action="ne-resize"></cropper-handle>
      <cropper-handle action="nw-resize"></cropper-handle>
      <cropper-handle action="se-resize"></cropper-handle>
      <cropper-handle action="sw-resize"></cropper-handle>
    </cropper-selection>
  </cropper-canvas>`;

const toBlob = (
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number,
): Promise<Blob | null> =>
  new Promise((resolve) => canvas.toBlob(resolve, type, quality));

// The canvas as a file under the upload limit: WebP where the browser encodes it (the server
// stores WebP anyway), else JPEG; CropError("too_large") when none fits
async function encode(canvas: HTMLCanvasElement): Promise<Blob> {
  const blob = await encodeUnderLimit([
    async () => {
      const webp = await toBlob(canvas, "image/webp", 0.9);
      return webp?.type === "image/webp" ? webp : null;
    },
    () => toBlob(canvas, "image/jpeg", 0.9),
    () => toBlob(canvas, "image/jpeg", 0.7),
  ]);
  if (!blob) {
    throw new CropError("too_large");
  }
  return blob;
}

// A Zoom game's photo, uncropped (ADR 0019): the whole image, shrunk so its longer side fits
// maxSide. CropError when it cannot be read or stays over the limit.
export async function shrinkImage(file: Blob, maxSide: number): Promise<Blob> {
  const image = await loadImage(file);
  try {
    const { naturalWidth: w, naturalHeight: h } = image;
    const scale = Math.min(1, maxSide / Math.max(w, h));
    const out = document.createElement("canvas");
    out.width = Math.max(1, Math.round(w * scale));
    out.height = Math.max(1, Math.round(h * scale));
    out.getContext("2d")!.drawImage(image, 0, 0, out.width, out.height);
    return await encode(out);
  } finally {
    URL.revokeObjectURL(image.src);
  }
}

export function mountCropper(
  host: HTMLElement,
  image: HTMLImageElement,
  kind: CropKind,
): MountedCropper {
  const { aspect, maxSide } = UPLOAD_SHAPES[kind];
  host.innerHTML = template(aspect);
  const canvas = host.querySelector<HTMLElement>("cropper-canvas")!;
  const ratio = image.naturalWidth / image.naturalHeight;
  canvas.style.aspectRatio = String(ratio);
  canvas.style.width = `min(100%, calc(var(--crop-max-height) * ${ratio}))`;
  const cropperImage = host.querySelector<CropperImage>("cropper-image")!;
  cropperImage.setAttribute("src", image.src);
  cropperImage.setAttribute("alt", "");
  const selection = host.querySelector<CropperSelection>("cropper-selection")!;
  selection.addEventListener("change", (event) => {
    const wanted = (event as CustomEvent<Rect>).detail;
    const { width, height } = canvas.getBoundingClientRect();
    const kept = clampRect(wanted, { width, height }, aspect);
    if (!sameRect(wanted, kept)) {
      event.preventDefault();
      selection.$change(kept.x, kept.y, kept.width, kept.height);
    }
  });
  return {
    async crop(): Promise<Blob> {
      // On-screen frame to the image's own pixels, from where the image sits in the canvas
      const shown = cropperImage.getBoundingClientRect();
      const box = canvas.getBoundingClientRect();
      const a = shown.width / image.naturalWidth;
      const e = shown.left - box.left;
      const f = shown.top - box.top;
      const size = cropOutputSize(selection.width / a, aspect, maxSide);
      const out = document.createElement("canvas");
      out.width = size.width;
      out.height = size.height;
      out
        .getContext("2d")!
        .drawImage(
          image,
          (selection.x - e) / a,
          (selection.y - f) / a,
          selection.width / a,
          selection.height / a,
          0,
          0,
          size.width,
          size.height,
        );
      return encode(out);
    },
    zoom(step: number): void {
      selection.$zoom(step);
    },
    destroy(): void {
      host.replaceChildren();
    },
  };
}
