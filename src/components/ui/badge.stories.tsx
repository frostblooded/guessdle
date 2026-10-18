import type { Meta, StoryObj } from "@storybook/react-vite";
import { Badge } from "./badge.tsx";

const meta = {
  component: Badge,
  args: { children: "Draft" },
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "secondary", "outline", "success", "warn", "error"],
    },
  },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Secondary: Story = {};
export const Success: Story = {
  args: { variant: "success", children: "Published" },
};
export const Warn: Story = { args: { variant: "warn", children: "In review" } };
export const Error: Story = {
  args: { variant: "error", children: "Rejected" },
};
