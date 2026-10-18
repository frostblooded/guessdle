import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { GuessBox } from "./guess-box.tsx";

const NAMES = ["Ati", "Bela", "Cookie", "Dido", "Eddie", "Abby"];

// The box holds its own text here; on Play the page does
function Box({ start, disabled }: { start: string; disabled: boolean }) {
  const [value, setValue] = useState(start);
  return (
    <div className="flex max-w-md">
      <GuessBox
        names={NAMES}
        value={value}
        onChange={setValue}
        onSubmit={() => setValue("")}
        disabled={disabled}
      />
    </div>
  );
}

const meta = {
  component: Box,
  args: { start: "", disabled: false },
} satisfies Meta<typeof Box>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};
// Type into the box to see the suggestions
export const Typed: Story = { args: { start: "e" } };
export const Disabled: Story = { args: { disabled: true } };
