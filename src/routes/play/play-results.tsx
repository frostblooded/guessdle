// The guesses under Play's guess box, newest first: a classic game's graded rows under its column
// titles, or a Blur or Sequence game's names.
import { GuessRow, TitleRow } from "../../components/board.tsx";
import { EmptyState } from "../../components/page.tsx";
import { BlurGuesses, BlurView } from "../../components/blur-view.tsx";
import { SequenceView } from "../../components/sequence-view.tsx";
import { isImageGame, type GameKind } from "../../game/blur.ts";
import {
  boardColumns,
  guessedNames,
  isAnswerRow,
  type BoardColumn,
  type EntryRef,
  type GameAttribute,
  type GradedAttribute,
} from "../../game/game.ts";

// What a board of guesses shows (Play and party rounds): a Blur or Sequence game's tries and wrong
// guesses, the entries left to guess, and a classic game's columns
export function boardOf(
  game: {
    kind: GameKind;
    blurTries?: number | undefined;
    attributes: readonly GameAttribute[];
  },
  entries: readonly EntryRef[],
  rows: readonly GradedAttribute[][],
) {
  const image = isImageGame(game.kind);
  // Each row names its guess; those names leave the suggestions
  const used = guessedNames(rows);
  const unguessed = entries.filter((entry) => !used.has(entry.name));
  return {
    // Null for a classic game, whose guesses are unlimited
    tries: image ? (game.blurTries ?? 1) : null,
    wrong: rows.filter((row) => !isAnswerRow(row)).length,
    unguessed,
    names: unguessed.map((entry) => entry.name),
    // Null for a Blur or Sequence game, which shows names only
    titles: image ? null : boardColumns(game.attributes),
  };
}

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
  // A classic game's columns; null for a Blur or Sequence game
  titles: readonly BoardColumn[] | null;
  loading: boolean;
  loadingText: string;
  empty: boolean;
}) {
  return (
    <div className="results flex flex-col gap-2 sm:gap-2.5">
      {titles && <TitleRow columns={titles} />}
      {loading && <EmptyState id="loading-state">{loadingText}</EmptyState>}
      {empty && (
        <EmptyState id="empty-state">
          {titles
            ? "No guesses yet. Guess any name above to start."
            : "No guesses yet. Look at the picture, then guess a name above or skip."}
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
