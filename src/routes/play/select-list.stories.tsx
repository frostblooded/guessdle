import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { SelectList } from "./select-list.tsx";

const COLORS = ["Black", "White", "Ginger", "Grey"];
const NAMES = [
  "Ati",
  "Bela",
  "Cookie",
  "Dido",
  "Eddie",
  "Abby",
  "Mochi",
  "Pip",
];

const meta = {
  component: SelectList,
  args: {
    entries: NAMES.map((name, i) => ({
      name,
      photo: "",
      values: [COLORS[i % COLORS.length]!, String(i + 1), ["Ann", "Bo"]],
    })),
    attributes: [
      { name: "Color", type: "text" },
      { name: "Age", type: "number" },
      { name: "Owners", type: "list" },
    ],
    photos: true,
    onPick: fn(),
  },
} satisfies Meta<typeof SelectList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Classic: Story = {};
// A Blur game: names only, several to a line
export const Blur: Story = {
  args: {
    entries: NAMES.map((name) => ({ name, photo: "", values: [] })),
    attributes: [],
    photos: false,
  },
};
