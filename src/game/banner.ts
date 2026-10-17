// A game's gallery banner (issue #89): its own cover, or else a collage of its entries' photos.

// Two rows of four at most
export const MAX_TILES = 8;

export type Banner =
  | { kind: "cover"; url: string }
  | { kind: "collage"; tiles: string[]; columns: number }
  | null;

// photos: the viewer's visible (active) entries in roster order; blanks are skipped.
// Up to four tiles share one row; more are trimmed to an even count over two full rows.
// No cover and no photos is no banner.
export function bannerOf(cover: string, photos: readonly string[]): Banner {
  if (cover !== "") {
    return { kind: "cover", url: cover };
  }
  const usable = photos.filter((photo) => photo !== "").slice(0, MAX_TILES);
  if (usable.length === 0) {
    return null;
  }
  if (usable.length <= 4) {
    return { kind: "collage", tiles: usable, columns: usable.length };
  }
  const even = usable.length - (usable.length % 2);
  return { kind: "collage", tiles: usable.slice(0, even), columns: even / 2 };
}
