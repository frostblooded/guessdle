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
  const used = guessedNames(rows);
  const unguessed = entries.filter((entry) => !used.has(entry.name));
  return {
    tries: image ? (game.blurTries ?? 1) : null,
    wrong: rows.filter((row) => !isAnswerRow(row)).length,
    unguessed,
    names: unguessed.map((entry) => entry.name),
    titles: image ? null : boardColumns(game.attributes),
  };
}

export const answerImageUrl = (
  path: ImagePath,
  slug: string,
  n: number,
  board: number,
  day: number | undefined,
): string =>
  `/api/games/${encodeURIComponent(slug)}/${path}/${n}?b=${board}${day === undefined ? "" : `&day=${day}`}`;

type ImagePath = "blur" | "shot";

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
