// The edit page's crop step (issue #82): a modal around image-cropper.ts.
// Resolves to the cropped file, or null when the owner cancels; rejects with a CropError.
import { CropError, type ImageKind } from "./game/crop.ts";
import { loadImage, mountCropper } from "./image-cropper.ts";

// Static markup; kind is "photo" or "cover"
const markup = (kind: ImageKind): string => `
  <form method="dialog">
    <h2 id="crop-title">Crop the ${kind}</h2>
    <p>Drag the frame to move it; zoom to pick how much shows.</p>
    <div class="crop-host"></div>
    <div class="button-row">
      <button id="crop-zoom-out" class="btn btn-secondary btn-sm" type="button" aria-label="Zoom out">−</button>
      <button id="crop-zoom-in" class="btn btn-secondary btn-sm" type="button" aria-label="Zoom in">+</button>
    </div>
    <div class="dialog-actions">
      <button id="crop-cancel" class="btn btn-secondary" value="cancel">Cancel</button>
      <button id="crop-confirm" class="btn btn-primary" value="confirm" autofocus>Use ${kind}</button>
    </div>
  </form>`;

export async function cropFile(
  file: Blob,
  kind: ImageKind,
): Promise<Blob | null> {
  const image = await loadImage(file);
  const dialog = document.createElement("dialog");
  dialog.id = "crop-dialog";
  dialog.className = "dialog crop-dialog";
  dialog.setAttribute("aria-labelledby", "crop-title");
  dialog.innerHTML = markup(kind);
  const form = dialog.querySelector("form")!;
  const host = dialog.querySelector<HTMLElement>(".crop-host")!;
  const zoomIn = dialog.querySelector<HTMLButtonElement>("#crop-zoom-in")!;
  const zoomOut = dialog.querySelector<HTMLButtonElement>("#crop-zoom-out")!;
  document.body.append(dialog);
  dialog.showModal();
  const cropper = mountCropper(host, image, kind);
  // A bigger frame shows more of the photo: zooming in shrinks it
  zoomIn.onclick = (): void => cropper.zoom(-0.1);
  zoomOut.onclick = (): void => cropper.zoom(0.1);
  // The crop reads the frame's on-screen geometry, so it runs before the dialog closes;
  // Escape closes it as a cancel
  const confirmed = await new Promise<boolean>((resolve) => {
    form.onsubmit = (event: SubmitEvent): void => {
      event.preventDefault();
      resolve(
        (event.submitter as HTMLButtonElement | null)?.value === "confirm",
      );
    };
    dialog.addEventListener("close", () => resolve(false));
  });
  try {
    return confirmed ? await cropper.crop() : null;
  } finally {
    dialog.close();
    cropper.destroy();
    dialog.remove();
  }
}

// The crop step for a picked file: the cropped file, or null after a cancel or a failure
// (whose text lands in `error`)
export async function cropForUpload(
  file: Blob,
  kind: ImageKind,
  error: HTMLElement,
): Promise<Blob | null> {
  try {
    return await cropFile(file, kind);
  } catch (e) {
    if (e instanceof CropError) {
      error.textContent = e.message;
      return null;
    }
    throw e;
  }
}
