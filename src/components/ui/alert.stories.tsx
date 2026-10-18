import type { Meta, StoryObj } from "@storybook/react-vite";
import { Alert } from "./alert.tsx";

const meta = {
  component: Alert,
  args: { children: "Saved." },
  argTypes: {
    variant: {
      control: "select",
      options: ["info", "success", "warn", "error"],
    },
  },
} satisfies Meta<typeof Alert>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Info: Story = {};
export const Success: Story = { args: { variant: "success" } };
export const Warn: Story = {
  args: {
    variant: "warn",
    children: "Too many guesses. Try again in a minute.",
  },
};
export const Error: Story = {
  args: { variant: "error", children: "Could not load the game." },
};
