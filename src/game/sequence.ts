export const hasAllShots = (shots: readonly string[], count: number): boolean =>
  shots.length >= count && shots.slice(0, count).every((shot) => shot !== "");

export const slotCount = (shots: readonly string[], count: number): number =>
  Math.max(
    count,
    shots.reduce((last, shot, i) => (shot === "" ? last : i + 1), 0),
  );
