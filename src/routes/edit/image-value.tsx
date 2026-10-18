// The Entries tab's picture fields: an upload button, and an Image attribute's field.
import { Button, buttonVariants } from "../../components/ui/button.tsx";
import { useCrop } from "../../components/crop-dialog.tsx";
import { api, errorText } from "../../manage-client.ts";
import { IMAGE_TYPES } from "./types.ts";

// Crops and uploads the picture chosen in a file input, then hands its URL to `done`. Problems
// go to `setError`; `dialog` is the crop dialog to render.
export function usePhotoUpload(setError: (text: string) => void) {
  const { crop, dialog } = useCrop(setError);
  const upload = async (
    input: HTMLInputElement,
    done: (url: string) => void,
  ): Promise<void> => {
    const file = input.files?.[0];
    input.value = "";
    if (!file) {
      return;
    }
    setError("");
    const cropped = await crop(file, "photo");
    if (!cropped) {
      return;
    }
    const up = await api<{ url?: string }>(
      "POST",
      "/api/uploads?kind=photo",
      cropped,
    );
    const url = up?.status === 200 ? up.data.url : undefined;
    if (url) {
      done(url);
    } else {
      setError(errorText(up));
    }
  };
  return { upload, dialog };
}
// A file input dressed as a button: crops and uploads happen in `onPick`
export function ImagePicker({
  id,
  label = "Choose image",
  onPick,
}: {
  id: string;
  label?: string;
  onPick: (input: HTMLInputElement) => void;
}) {
  return (
    <>
      <input
        type="file"
        id={id}
        accept={IMAGE_TYPES}
        className="sr-only"
        onChange={(event) => onPick(event.target)}
      />
      <label
        className={buttonVariants({ variant: "outline", size: "sm" })}
        htmlFor={id}
      >
        {label}
      </label>
    </>
  );
}

// An Image attribute's field: its picture, if any, with Choose and Remove
export function ImageValue({
  id,
  name,
  src,
  onPick,
  onRemove,
}: {
  id: string;
  name: string;
  src: string;
  onPick: (input: HTMLInputElement) => void;
  onRemove: () => void;
}) {
  return (
    <>
      <p className="text-sm font-medium">{name} (picture, optional)</p>
      {src && (
        <img
          id={`${id}-preview`}
          className="entry-image-preview size-24 rounded-lg object-cover"
          src={src}
          alt=""
        />
      )}
      <div className="flex flex-wrap gap-2">
        <ImagePicker id={id} onPick={onPick} />
        {src && (
          <Button
            id={`${id}-remove`}
            variant="ghost"
            size="sm"
            onClick={onRemove}
          >
            Remove
          </Button>
        )}
      </div>
    </>
  );
}
