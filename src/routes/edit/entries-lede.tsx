// The line above the editor's entry list: what an entry is in this kind of game, and what it
// needs.
import type { GameKind } from "../../game/blur.ts";

export function EntriesLede({
  kind,
  tries,
}: {
  kind: GameKind;
  // A Sequence game's photos per entry
  tries: number;
}) {
  return (
    <p className="lede text-sm text-muted-foreground">
      {kind === "sequence" ? (
        <>
          Each entry is one possible answer, shown to players as {tries} photos,
          one at a time. An entry missing photos can still be guessed but is
          never a day&apos;s answer.
        </>
      ) : kind === "blur" ? (
        <>
          Each entry is one possible answer. A Blur game plays with a single
          entry, and every entry needs an image and the order its nine squares
          clear in.
        </>
      ) : (
        <>
          Each entry is a row on the board. Every entry needs a value for every
          attribute except pictures, which may stay empty.
        </>
      )}
    </p>
  );
}
