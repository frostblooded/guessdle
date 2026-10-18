import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "./button.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./card.tsx";

const meta = { component: Card } satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Card className="max-w-sm">
      <CardHeader>
        <CardTitle>Catdle</CardTitle>
        <CardDescription>
          Guess the cat of the day from its colors and owners.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button>Play</Button>
      </CardContent>
    </Card>
  ),
};
