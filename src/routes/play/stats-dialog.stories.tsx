import type { Meta, StoryObj } from "@storybook/react-vite";
import { StatsDialog } from "./stats-dialog.tsx";

const meta = {
  component: StatsDialog,
  args: {
    open: true,
    onOpenChange: () => {},
    answer: "Ati",
    failed: false,
    stats: {
      day: 427,
      you: { guesses: 3, seconds: 95 },
      players: 14,
      guesses: [1, 3, 5, 2, 2, 1, 0, 0, 0, 0],
      times: [2, 3, 4, 3, 1, 1],
      fewerGuessesThan: 46,
      fasterThan: 62,
    },
  },
} satisfies Meta<typeof StatsDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Victory: Story = {};
export const FirstSolver: Story = {
  args: {
    stats: {
      day: 427,
      you: { guesses: 12, seconds: 4000 },
      players: 1,
      guesses: [0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
      times: [0, 0, 0, 0, 0, 1],
      fewerGuessesThan: null,
      fasterThan: null,
    },
  },
};
export const UnknownTime: Story = {
  args: {
    stats: {
      day: 427,
      you: { guesses: 2, seconds: null },
      players: 3,
      guesses: [1, 2, 0, 0, 0, 0, 0, 0, 0, 0],
      times: [1, 0, 0, 0, 0, 0],
      fewerGuessesThan: 50,
      fasterThan: null,
    },
  },
};
export const FirstTryFailed: Story = {
  args: {
    stats: {
      day: 427,
      you: null,
      players: 5,
      guesses: [0, 2, 2, 1, 0, 0, 0, 0, 0, 0],
      times: [1, 2, 1, 1, 0, 0],
      fewerGuessesThan: null,
      fasterThan: null,
      firstTryFailed: true,
    },
  },
};
export const Loading: Story = { args: { stats: null } };
export const Failed: Story = { args: { stats: null, failed: true } };
