import { Button, buttonVariants } from "../../components/ui/button.tsx";
import { useCrop } from "../../components/crop-dialog.tsx";
import type { ImageKind } from "../../game/crop.ts";
import { api, errorText } from "../../manage-client.ts";
import { IMAGE_TYPES } from "./types.ts";

export function usePhotoUpload(setError: (text: string) => void) {
  const { crop, dialog } = useCrop(setError);
  const uploadFile = async (
    file: File,
    shape: ImageKind,
  ): Promise<string | null> => {
    setError("");
    const cropped = await crop(file, shape);
    if (!cropped) {
      return null;
    }
    const up = await api<{ url?: string }>(
      "POST",
      `/api/uploads?kind=${shape}`,
      cropped,
    );
    const url = up?.status === 200 ? up.data.url : undefined;
    if (!url) {
      setError(errorText(up));
    }
    return url ?? null;
  };

  const upload = async (
    input: HTMLInputElement,
    done: (url: string) => void,
  ): Promise<void> => {
    const file = input.files?.[0];
    input.value = "";
    const url = file && (await uploadFile(file, "photo"));
    if (url) {
      done(url);
    }
  };
  return { upload, uploadFile, dialog };
}
export function ImagePicker({
  id,
  onPick,
}: {
  id: string;
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
        Choose image
      </label>
    </>
  );
}

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
