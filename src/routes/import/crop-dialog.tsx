import { useRef, useState, type PointerEvent } from "react";
import { Button } from "../../components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "../../components/ui/dialog.tsx";
import type { ImportCrop } from "../../game/import-file.ts";
import { centeredSquare, type WikiRow } from "../../game/wiki-pick.ts";

const MIN_SIDE = 16;

export function CropDialog({
  row,
  crop: initial,
  name,
  onClose,
  onSave,
}: {
  row: WikiRow;
  crop: ImportCrop;
  name: string;
  onClose: () => void;
  onSave: (crop: ImportCrop) => void;
}) {
  const [box, setBox] = useState(initial);
  const image = useRef<HTMLImageElement>(null);

  const drag = (event: PointerEvent, resize: boolean): void => {
    const img = image.current;
    if (!img) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const [w, h] = [img.clientWidth, img.clientHeight];
    const start = { x: event.clientX, y: event.clientY, ...box };
    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture(event.pointerId);
    const move = (m: globalThis.PointerEvent): void => {
      const dx = (m.clientX - start.x) / w;
      const dy = (m.clientY - start.y) / h;
      if (resize) {
        const side = Math.max(
          MIN_SIDE,
          Math.min(
            start.width * w + Math.max(dx * w, dy * h),
            (1 - start.left) * w,
            (1 - start.top) * h,
          ),
        );
        setBox({ ...start, width: side / w, height: side / h });
      } else {
        setBox({
          ...start,
          left: Math.min(Math.max(0, start.left + dx), 1 - start.width),
          top: Math.min(Math.max(0, start.top + dy), 1 - start.height),
        });
      }
    };
    const up = (): void => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent id="wiki-crop" className="max-w-xl shadow-2xl" dim={false}>
        <DialogTitle className="pr-8 text-xl">
          Edit picture of {name}
        </DialogTitle>
        <DialogDescription className="text-sm text-muted-foreground">
          Drag the square to move it and its corner to resize it. Only this
          square is imported, as the entry's photo.
        </DialogDescription>
        <div className="relative justify-self-center leading-none select-none touch-none">
          <img
            ref={image}
            src={row.thumb ?? ""}
            alt=""
            className="block max-h-[55vh] max-w-full"
            draggable={false}
          />
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div
              className="absolute"
              style={{
                boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.55)",
                left: `${box.left * 100}%`,
                top: `${box.top * 100}%`,
                width: `${box.width * 100}%`,
                height: `${box.height * 100}%`,
              }}
            />
          </div>
          <div
            id="wiki-crop-box"
            className="absolute cursor-move outline-2 outline-white [box-shadow:0_0_0_1px_rgba(0,0,0,.6)]"
            style={{
              left: `${box.left * 100}%`,
              top: `${box.top * 100}%`,
              width: `${box.width * 100}%`,
              height: `${box.height * 100}%`,
            }}
            onPointerDown={(event) => drag(event, false)}
          >
            <span
              className="absolute -right-2 -bottom-2 size-4 cursor-nwse-resize rounded-full border border-black/50 bg-white"
              onPointerDown={(event) => drag(event, true)}
            />
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            variant="outline"
            onClick={() =>
              row.thumbSize && setBox(centeredSquare(row.thumbSize))
            }
          >
            Center
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button id="wiki-crop-save" onClick={() => onSave(box)}>
            Use this square
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
