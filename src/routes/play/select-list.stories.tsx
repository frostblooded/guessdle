import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import ati from "../../../howto/ati.jpg";
import cookie from "../../../howto/cookie.jpg";
import eddie from "../../../howto/eddie.jpg";
import { SelectList } from "./select-list.tsx";

const PHOTOS = [ati, cookie, eddie, ""];
const NAMES = [
  "Ati",
  "Bela",
  "Cookie",
  "Dido",
  "Eddie",
  "Abby",
  "Mochi",
  "Pip",
  "Oreo",
  "Sunny",
  "Kiara",
  "Jaro",
  "Todorka",
  "Murlin",
];

const meta = {
  component: SelectList,
  args: {
    entries: NAMES.map((name, i) => ({
      id: i + 1,
      name,
      photo: PHOTOS[i % PHOTOS.length]!,
    })),
    onPick: fn(),
  },
} satisfies Meta<typeof SelectList>;

export default meta;
type Story = StoryObj<typeof meta>;

// More than three rows: the window scrolls
export const Classic: Story = {};
// A Blur or Sequence game: no pictures, names only
export const NamesOnly: Story = {
  args: {
    entries: NAMES.map((name, i) => ({ id: i + 1, name, photo: "" })),
  },
};
