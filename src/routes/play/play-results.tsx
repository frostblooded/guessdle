// The guesses under Play's guess box, newest first: a classic game's graded rows under its column
// titles, or a Zoom game's names.
import { BoardRow, GuessRow, TitleTile } from "../../components/board.tsx";
import { EmptyState } from "../../components/page.tsx";
import { ZoomGuesses } from "../../components/zoom-view.tsx";
import type { GradedAttribute } from "../../game/game.ts";

export function PlayResults({
  rows,
  titles,
  loading,
  empty,
}: {
  rows: readonly GradedAttribute[][];
  // A classic game's column titles; null for a Zoom game
  titles: readonly string[] | null;
  loading: boolean;
  empty: boolean;
}) {
  return (
    <div className="results flex flex-col gap-2 sm:gap-2.5">
      {titles && (
        <BoardRow
          id="guess-results-titles-row"
          columns={titles.length}
          aria-hidden="true"
        >
          {titles.map((title, i) => (
            <TitleTile key={i} className="guess-result-title">
              {title}
            </TitleTile>
          ))}
        </BoardRow>
      )}
      {loading && (
        <EmptyState id="loading-state">Loading today&apos;s game…</EmptyState>
      )}
      {empty && (
        <EmptyState id="empty-state">
          {titles
            ? "No guesses yet. Start typing a name above, then pick one."
            : "No guesses yet. Look at the picture, then type a name above."}
        </EmptyState>
      )}
      {titles ? (
        <div
          id="guess-results-container"
          className="flex flex-col gap-2 sm:gap-2.5"
        >
          {rows.map((row, i) => (
            <GuessRow key={rows.length - i} row={row} />
          ))}
        </div>
      ) : (
        <ZoomGuesses rows={rows} />
      )}
    </div>
  );
}
