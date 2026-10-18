// A Blur game's number of tries on the Details tab. Each wrong guess clears one more square.
import { Label, NativeSelect } from "../../components/ui/input.tsx";
import { MAX_BLUR_TRIES } from "../../game/limits.ts";

export function BlurTriesField({
  value,
  onChange,
}: {
  value: number;
  onChange: (count: number) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor="edit-blur-tries">
        Tries (each wrong guess clears one more square)
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
