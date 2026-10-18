import type { Meta, StoryObj } from "@storybook/react-vite";
import { GameKindLabel, KIND_LABELS } from "./game-kind.tsx";

const meta = {
  component: GameKindLabel,
  args: { kind: "classic" },
  argTypes: {
    kind: { control: "select", options: Object.keys(KIND_LABELS) },
  },
} satisfies Meta<typeof GameKindLabel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Classic: Story = {};
export const Blur: Story = { args: { kind: "blur" } };
export const Sequence: Story = { args: { kind: "sequence" } };
// As the gallery card footer shows it
export const InCardFooter: Story = {
  render: (args) => (
    <p className="flex flex-wrap items-center gap-x-1.5 text-xs font-medium text-muted-foreground">
      <GameKindLabel {...args} />
      <span aria-hidden="true">·</span>
      <span>24 entries</span>
    </p>
  ),
};
