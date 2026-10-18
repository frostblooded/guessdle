import type { Meta, StoryObj } from "@storybook/react-vite";
import { MemoryRouter } from "react-router";
import { DayList } from "./day-list.tsx";

const meta = {
  component: DayList,
  decorators: [
    (Story) => (
      <MemoryRouter>
        <Story />
      </MemoryRouter>
    ),
  ],
  args: {
    slug: "petdle",
    today: 4,
    days: [
      { day: 4, date: "2026-10-18", status: "playing" },
      { day: 3, date: "2026-10-17", status: "won" },
      { day: 2, date: "2026-10-16", status: "gave-up" },
      { day: 1, date: "2026-10-15", status: "unplayed" },
      { day: 0, date: "2026-10-14", status: "won" },
    ],
  },
} satisfies Meta<typeof DayList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Mixed: Story = {};
export const FirstDay: Story = {
  args: {
    today: 0,
    days: [{ day: 0, date: "2026-10-18", status: "unplayed" }],
  },
};
