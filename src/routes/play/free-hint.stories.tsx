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
export const ImageHint: Story = {
  args: {
    hints: undefined,
    hint: {
      kind: "attribute",
      attribute: "Photo",
      value:
        "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1'%3E%3Crect width='1' height='1' fill='%23b08968'/%3E%3C/svg%3E",
      image: true,
    },
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
