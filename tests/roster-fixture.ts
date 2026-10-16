// A small made-up game for the client-side unit tests
import type { Entry, GameAttribute } from "../src/game/game.ts";

export const SLUG = "pets";
export const ATTRIBUTES: GameAttribute[] = [
  { name: "Colors", type: "list" },
  { name: "Owner", type: "text" },
];
const make = (
  id: number,
  name: string,
  colors: string[],
  owner: string,
): Entry => ({
  id,
  name,
  photo: `/uploads/${id}.webp`,
  values: [colors, owner],
});
export const GUESS_DATA: Entry[] = [
  make(1, "Ati", ["Black", "Orange"], "Niki"),
  make(2, "Bela", ["Grey", "White"], "Beti"),
  make(3, "Cookie", ["Orange"], "Niki"),
  make(4, "Dido", ["Grey"], "Beti"),
  make(5, "Eli", ["Black"], "Ico"),
];
