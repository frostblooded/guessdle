import { Label, NativeSelect } from "../../components/ui/input.tsx";
import { MAX_BLUR_TRIES } from "../../game/limits.ts";

export function BlurTriesField({
  value,
  onChange,
  sequence = false,
}: {
  value: number;
  onChange: (count: number) => void;
  sequence?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor="edit-blur-tries">
        {sequence
          ? "Photos per entry (each wrong guess or skip shows the next)"
          : "Tries (each wrong guess clears one more square)"}
      </Label>
      <NativeSelect
        id="edit-blur-tries"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      >
        {Array.from({ length: MAX_BLUR_TRIES }, (_, i) => (
          <option key={i} value={i + 1}>
            {i + 1}
          </option>
        ))}
      </NativeSelect>
    </div>
  );
}
