import type { Meta, StoryObj } from "@storybook/react-vite";
import { Badge } from "./badge.tsx";
import { Table, TableCell, TableHead, TableRow } from "./table.tsx";

const meta = { component: Table } satisfies Meta<typeof Table>;

export default meta;
type Story = StoryObj<typeof meta>;

const GAMES = [
  { name: "Petdle", owner: "Sam", status: "Published" },
  { name: "Plantdle", owner: "Niki", status: "In review" },
];

// The admin games list
export const Default: Story = {
  render: () => (
    <Table>
      <thead>
        <TableRow>
          <TableHead>Game</TableHead>
          <TableHead>Owner</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </thead>
      <tbody>
        {GAMES.map((game) => (
          <TableRow key={game.name}>
            <TableCell>{game.name}</TableCell>
            <TableCell>{game.owner}</TableCell>
            <TableCell>
              <Badge variant={game.status === "Published" ? "success" : "warn"}>
                {game.status}
              </Badge>
            </TableCell>
          </TableRow>
        ))}
      </tbody>
    </Table>
  ),
};
