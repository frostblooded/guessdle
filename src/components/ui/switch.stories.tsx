import type { Meta, StoryObj } from "@storybook/react-vite";
import { Switch } from "./switch.tsx";

const meta = {
  component: Switch,
  args: { "aria-label": "Email me" },
} satisfies Meta<typeof Switch>;

export default meta;
type Story = StoryObj<typeof meta>;

export const On: Story = { args: { defaultChecked: true } };
export const Off: Story = { args: { defaultChecked: false } };
export const Disabled: Story = {
  args: { defaultChecked: true, disabled: true },
};
