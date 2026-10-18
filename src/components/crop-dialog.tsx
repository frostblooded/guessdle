// The editor's crop step (issue #82): a modal around image-cropper.ts. `useCrop` gives a
// `crop(file, kind)` that resolves to the cropped file, or null after a cancel or a failure,
// whose text goes to `onError`; the page renders the returned `dialog`.
import { Minus, Plus } from "lucide-react";
import { useCallback, useRef, useState, type ReactNode } from "react";
import { CropError, type ImageKind } from "../game/crop.ts";
import {
  loadImage,
  mountCropper,
  type MountedCropper,
} from "../image-cropper.ts";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "./ui/alert-dialog.tsx";
import { Button } from "./ui/button.tsx";

// What the dialog calls each kind: a Sequence photo is still a photo to the owner
const LABELS: Record<ImageKind, string> = {
  photo: "photo",
  shot: "photo",
  cover: "cover",
};

interface Job {
  kind: ImageKind;
  image: HTMLImageElement;
  // The cropped file, null for a cancel, or the CropError the crop threw
  done(out: Blob | null | CropError): void;
}

function CropDialog({ job }: { job: Job }) {
  const cropper = useRef<MountedCropper | null>(null);
  const [busy, setBusy] = useState(false);
  // Mounted with the host and gone with it (StrictMode mounts twice)
  const host = useCallback(
    (el: HTMLDivElement) => {
      const mounted = mountCropper(el, job.image, job.kind);
      cropper.current = mounted;
      return () => {
        mounted.destroy();
        cropper.current = null;
      };
    },
    [job],
  );

  // The crop reads the frame's on-screen geometry, so it runs while the dialog is still open
  const confirm = async (): Promise<void> => {
    setBusy(true);
    try {
      job.done(await cropper.current!.crop());
    } catch (e) {
      if (!(e instanceof CropError)) {
        throw e;
      }
      job.done(e);
    }
  };

  return (
    <AlertDialog open onOpenChange={(open) => !open && job.done(null)}>
      <AlertDialogContent
        id="crop-dialog"
        className="crop-dialog max-w-[40rem] [--crop-max-height:min(60vh,28rem)]"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          document.querySelector<HTMLElement>("#crop-confirm")?.focus();
        }}
      >
        <AlertDialogTitle id="crop-title">
          Crop the {LABELS[job.kind]}
        </AlertDialogTitle>
        <AlertDialogDescription>
          Drag the frame to move it; zoom to pick how much shows.
        </AlertDialogDescription>
        <div
          className="crop-host [&_cropper-canvas]:mx-auto [&_cropper-canvas]:block"
          ref={host}
        />
        <div className="flex gap-2">
          {/* A bigger frame shows more of the photo: zooming in shrinks it */}
          <Button
            id="crop-zoom-out"
            variant="outline"
            size="sm"
            aria-label="Zoom out"
            onClick={() => cropper.current?.zoom(0.1)}
          >
            <Minus />
          </Button>
          <Button
            id="crop-zoom-in"
            variant="outline"
            size="sm"
            aria-label="Zoom in"
            onClick={() => cropper.current?.zoom(-0.1)}
          >
            <Plus />
          </Button>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel id="crop-cancel">Cancel</AlertDialogCancel>
          <Button
            id="crop-confirm"
            disabled={busy}
            onClick={() => void confirm()}
          >
            Use {LABELS[job.kind]}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function useCrop(onError: (text: string) => void): {
  crop: (file: Blob, kind: ImageKind) => Promise<Blob | null>;
  dialog: ReactNode;
} {
  const [job, setJob] = useState<Job | null>(null);
  const crop = async (file: Blob, kind: ImageKind): Promise<Blob | null> => {
    let image: HTMLImageElement;
    try {
      image = await loadImage(file);
    } catch (e) {
      if (e instanceof CropError) {
        onError(e.message);
        return null;
      }
      throw e;
    }
    const out = await new Promise<Blob | null | CropError>((done) =>
      setJob({ kind, image, done }),
    );
    setJob(null);
    URL.revokeObjectURL(image.src);
    if (out instanceof CropError) {
      onError(out.message);
      return null;
    }
    return out;
  };
  return { crop, dialog: job && <CropDialog job={job} /> };
}
