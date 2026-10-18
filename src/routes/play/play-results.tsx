// The guesses under Play's guess box, newest first: a classic game's graded rows under its column
// titles, or a Blur game's names.
import { BoardRow, GuessRow, TitleTile } from "../../components/board.tsx";
import { EmptyState } from "../../components/page.tsx";
import { BlurGuesses } from "../../components/blur-view.tsx";
import type { GradedAttribute } from "../../game/game.ts";

// A Blur game's image with n squares clear; `board` refetches it on a fresh board, `day` names
// a past day
export const boardUrl = (
  slug: string,
  n: number,
  board: number,
  day: number | undefined,
): string =>
  `/api/games/${encodeURIComponent(slug)}/blur/${n}?b=${board}${day === undefined ? "" : `&day=${day}`}`;

export function PlayResults({
  rows,
  titles,
  loading,
  loadingText,
  empty,
}: {
  rows: readonly GradedAttribute[][];
  // A classic game's column titles; null for a Blur game
  titles: readonly string[] | null;
  loading: boolean;
  loadingText: string;
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
      {loading && <EmptyState id="loading-state">{loadingText}</EmptyState>}
      {empty && (
        <EmptyState id="empty-state">
          {titles
            ? "No guesses yet. Guess any name above to start."
            : "No guesses yet. Look at the picture, then guess a name above."}
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
        <BlurGuesses rows={rows} />
      )}
    </div>
  );
}
