// Sequence games (ADR 0020): like guessthe.game, players guess the entry from its photos, shown
// one at a time; each wrong guess or skip unlocks the next. Pure, so the server, the editor and
// Play share it.

// An entry may be an answer once every one of the game's `count` photos is uploaded; until then
// players can still guess it
export const hasAllShots = (shots: readonly string[], count: number): boolean =>
  shots.length >= count && shots.slice(0, count).every((shot) => shot !== "");

// How many photo slots the editor shows: the game's count, plus any filled slot beyond it (a
// lowered count keeps the extra photos so raising it again brings them back)
export const slotCount = (shots: readonly string[], count: number): number =>
  Math.max(
    count,
    shots.reduce((last, shot, i) => (shot === "" ? last : i + 1), 0),
  );
