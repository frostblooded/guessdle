import type { Meta, StoryObj } from "@storybook/react-vite";
import { FreeHintCard } from "./free-hint.tsx";

const meta = {
  component: FreeHintCard,
  args: {
    hints: { attribute: true, description: true },
    onTake: () => {},
  },
} satisfies Meta<typeof FreeHintCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Offer: Story = {};
export const NoDescription: Story = {
  args: { hints: { attribute: true, description: false } },
};
export const AttributeHint: Story = {
  args: {
    hints: undefined,
    hint: { kind: "attribute", attribute: "Colors", value: ["Grey", "White"] },
  },
};
export const DescriptionHint: Story = {
  args: {
    hints: undefined,
    hint: {
      kind: "description",
      description: "A grey tabby who sleeps on the radiator all winter.",
    },
  },
};
