// The guesses under Play's guess box, newest first: a classic game's graded rows under its column
// titles, or a Blur or Sequence game's names.
import { BoardRow, GuessRow, TitleTile } from "../../components/board.tsx";
import { EmptyState } from "../../components/page.tsx";
import { BlurGuesses, BlurView } from "../../components/blur-view.tsx";
import { SequenceView } from "../../components/sequence-view.tsx";
import type { GameKind } from "../../game/blur.ts";
import type { GradedAttribute } from "../../game/game.ts";

// What a Blur or Sequence game shows of the answer: the image with n squares clear (`blur`), or
// photo n (`shot`). `board` refetches it on a fresh board, `day` names a past day.
export const answerImageUrl = (
  path: ImagePath,
  slug: string,
  n: number,
  board: number,
  day: number | undefined,
): string =>
  `/api/games/${encodeURIComponent(slug)}/${path}/${n}?b=${board}${day === undefined ? "" : `&day=${day}`}`;

type ImagePath = "blur" | "shot";

// A Blur game's board or a Sequence game's photos, above the guess box (Play and party rounds)
export function AnswerImage({
  kind,
  url,
  ...progress
}: {
  kind: GameKind;
  url: (path: ImagePath, n: number) => string;
  tries: number;
  wrong: number;
  finished: boolean;
  // A Blur game's whole image, once over
  reveal?: string | undefined;
}) {
  return kind === "sequence" ? (
    <SequenceView shotUrl={(n) => url("shot", n)} {...progress} />
  ) : (
    <BlurView boardUrl={(n) => url("blur", n)} {...progress} />
  );
}

export function PlayResults({
  rows,
  titles,
  loading,
  loadingText,
  empty,
}: {
  rows: readonly GradedAttribute[][];
  // A classic game's column titles; null for a Blur or Sequence game
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
            ? "No guesses yet. Start typing a name above, then pick one."
            : "No guesses yet. Look at the picture, then type a name above or skip."}
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
