import type { Meta, StoryObj } from "@storybook/react-vite";
import { Bookmark } from "lucide-react";
import { MemoryRouter } from "react-router";
import { GameCardItem, GameGrid } from "./game-card.tsx";
import { Button } from "./ui/button.tsx";

const meta = {
  component: GameCardItem,
  args: {
    card: {
      slug: "birds",
      name: "Birdle",
      description: "Guess the bird of the day from its size and colors.",
      cover: "",
      photos: [],
      entryCount: 42,
      kind: "classic",
    },
  },
  decorators: [
    (Story) => (
      <MemoryRouter>
        <GameGrid>
          <Story />
        </GameGrid>
      </MemoryRouter>
    ),
  ],
} satisfies Meta<typeof GameCardItem>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Plain: Story = {};
// The gallery's Save button over the corner (drawn here without its dialog)
export const WithSaveCorner: Story = {
  args: {
    corner: (
      <Button
        variant="outline"
        size="icon"
        className="size-9 rounded-full bg-card/90 shadow-sm"
        aria-label="Save Birdle to a playlist"
      >
        <Bookmark aria-hidden="true" />
      </Button>
    ),
  },
};
