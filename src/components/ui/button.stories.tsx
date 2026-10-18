import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "./button.tsx";

const meta = {
  component: Button,
  args: { children: "Guess" },
  argTypes: {
    variant: {
      control: "select",
      options: [
        "default",
        "destructive",
        "outline",
        "secondary",
        "ghost",
        "link",
      ],
    },
    size: { control: "select", options: ["default", "sm", "lg", "icon"] },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Outline: Story = {
  args: { variant: "outline", children: "Reset" },
};
export const Ghost: Story = { args: { variant: "ghost", children: "Give up" } };
export const Destructive: Story = {
  args: { variant: "destructive", children: "Delete game" },
};
export const Small: Story = { args: { size: "sm", children: "Edit" } };
export const Disabled: Story = { args: { disabled: true } };
