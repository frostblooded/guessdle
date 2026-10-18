// A Zoom game's part count on the Details tab: parts per entry, which is also the number of tries.
import { Label, NativeSelect } from "../../components/ui/input.tsx";
import { MAX_ZOOM_PARTS } from "../../game/limits.ts";

export function ZoomPartsField({
  value,
  onChange,
}: {
  value: number;
  onChange: (count: number) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor="edit-zoom-parts">
        Zoomed parts per entry (one try each)
      </Label>
      <NativeSelect
        id="edit-zoom-parts"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      >
        {Array.from({ length: MAX_ZOOM_PARTS }, (_, i) => (
          <option key={i} value={i + 1}>
            {i + 1}
          </option>
        ))}
      </NativeSelect>
    </div>
  );
}
