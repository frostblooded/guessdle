import "cropperjs";
import type { CropperImage, CropperSelection } from "cropperjs";
import {
  clampRect,
  CropError,
  cropOutputSize,
  encodeUnderLimit,
  type ImageKind,
  type Rect,
  sameRect,
  UPLOAD_SHAPES,
} from "./game/crop.ts";

export interface MountedCropper {
  crop(): Promise<Blob>;
  zoom(step: number): void;
  destroy(): void;
}

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

export function mountCropper(
  host: HTMLElement,
  image: HTMLImageElement,
  kind: ImageKind,
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
      const blob = await encodeUnderLimit([
        async () => {
          const webp = await toBlob(out, "image/webp", 0.9);
          return webp?.type === "image/webp" ? webp : null;
        },
        () => toBlob(out, "image/jpeg", 0.9),
        () => toBlob(out, "image/jpeg", 0.7),
      ]);
      if (!blob) {
        throw new CropError("too_large");
      }
      return blob;
    },
    zoom(step: number): void {
      selection.$zoom(step);
    },
    destroy(): void {
      host.replaceChildren();
    },
  };
}
