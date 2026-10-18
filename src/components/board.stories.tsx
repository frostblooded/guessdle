import type { Meta, StoryObj } from "@storybook/react-vite";
import ati from "../../howto/ati.jpg";
import cookie from "../../howto/cookie.jpg";
import eddie from "../../howto/eddie.jpg";
import { Correctness } from "../game/correctness.ts";
import type { GradedAttribute } from "../game/game.ts";
import { BoardRow, GuessRow, TitleTile } from "./board.tsx";

const { Correct, PartiallyCorrect, Incorrect } = Correctness;

// A row as the API grades it: photo, name, then Colors and Owners
const row = (
  photo: string,
  ...cells: [GradedAttribute["value"], Correctness][]
): GradedAttribute[] => [
  { key: "photo", value: photo, correctness: Correct },
  ...cells.map(([value, correctness], i) => ({
    key: ["name", "colors", "owners"][i]!,
    value,
    correctness,
  })),
];

const ROWS = [
  row(
    ati,
    ["Ati", Correct],
    [["Black", "Orange", "White"], Correct],
    [["Niki"], Correct],
  ),
  row(
    eddie,
    ["Eddie", Incorrect],
    [["Orange", "White"], PartiallyCorrect],
    [["Stefi", "Yasen"], Incorrect],
  ),
  row(
    cookie,
    ["Cookie", Incorrect],
    [["Black", "Orange", "White"], Correct],
    [["Niki"], Correct],
  ),
];

const TITLES = ["Photo", "Name", "Colors", "Owners"];

function Board({ rows }: { rows: GradedAttribute[][] }) {
  return (
    <div className="flex max-w-3xl flex-col gap-2">
      <BoardRow columns={TITLES.length}>
        {TITLES.map((title) => (
          <TitleTile key={title}>{title}</TitleTile>
        ))}
      </BoardRow>
      {rows.map((r, i) => (
        <GuessRow key={i} row={r} />
      ))}
    </div>
  );
}

const meta = {
  component: Board,
  args: { rows: ROWS },
} satisfies Meta<typeof Board>;

export default meta;
type Story = StoryObj<typeof meta>;

// Newest first: a win after two guesses
export const Won: Story = {};
export const OneGuess: Story = { args: { rows: ROWS.slice(2) } };
export const Empty: Story = { args: { rows: [] } };
