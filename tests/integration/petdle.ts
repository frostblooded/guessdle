// Petdle as migration 005 stores it: entry ids run 1..19 in roster order.
export const GAME = "petdle";
export const START = "2025-08-15";
export const SLUGS = [
  "ati",
  "bela",
  "cookie",
  "dido",
  "eddie",
  "eli",
  "ilko",
  "jaro",
  "jeffy",
  "kiara",
  "kimi",
  "mochi",
  "murlin",
  "oreo",
  "patio",
  "pipi",
  "puhche",
  "sunny",
  "todorka",
];
export const PET_IDS: number[] = SLUGS.map((_, i) => i + 1);
// The entry id of an old pet slug
export const pid = (slug: string): number => {
  const index = SLUGS.indexOf(slug);
  if (index === -1) {
    throw new Error(`unknown pet ${slug}`);
  }
  return index + 1;
};
export const petName = (id: number): string =>
  SLUGS[id - 1]!.replace(/^./, (c) => c.toUpperCase());
