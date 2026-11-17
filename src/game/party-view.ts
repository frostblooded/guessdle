import { hintOffer } from "./board.ts";
import { isImageGame, type GameKind } from "./blur.ts";
import { revealHint, type FreeHint, type HintChoices } from "./free-hint.ts";
import type { GuessMode } from "./guess-mode.ts";
import type { Correctness } from "./correctness.ts";
import {
  gradeGuess,
  nameCell,
  SKIP,
  skippedRow,
  type Entry,
  type EntryRef,
  type GameAttribute,
  type GradedAttribute,
} from "./game.ts";
import {
  isDone,
  participants,
  progressOf,
  roundResults,
  standings,
  type PartyPlayer,
  type Progress,
  type RoundData,
  type RoundResult,
  type Standing,
} from "./party.ts";
import { quizGrade, type QuizQuestion } from "./quiz.ts";

export interface PartyView {
  code: string;
  game: {
    slug: string;
    name: string;
    kind: GameKind;
    blurTries?: number;
    questions?: number;
    attributes: GameAttribute[];
    guessMode: GuessMode;
    entries: EntryRef[];
  };
  ended: boolean;
  you: { playerId: number; host: boolean } | null;
  players: Standing[];
  round: LiveRound | null;
  history: FinishedRound[];
}

export interface LiveRound {
  number: number;
  live: boolean;
  progress: (Omit<Progress, "timeMs" | "score"> & { answered?: boolean })[];
  question?: QuizQuestion;
  yours: {
    rows: GradedAttribute[][];
    solved: boolean;
    gaveUp: boolean;
    lost: boolean;
    answer?: RevealedEntry;
    hint?: FreeHint;
    hints?: HintChoices;
    quizAnswer?: string | null;
  } | null;
}

export interface RevealedEntry extends EntryRef {
  description?: string;
}

export interface FinishedRound {
  number: number;
  answer: RevealedEntry;
  right?: string;
  results: (RoundResult & {
    guessNames: string[];
    grades: Correctness[][];
  })[];
}

export interface ViewInput {
  code: string;
  game: {
    slug: string;
    name: string;
    kind?: GameKind;
    blurTries?: number;
    questions?: number;
    guessMode?: GuessMode;
  };
  attributes: readonly GameAttribute[];
  entries: readonly Entry[];
  all: readonly Entry[];
  ended: boolean;
  players: readonly PartyPlayer[];
  rounds: readonly RoundData[];
  viewer: number | null;
}

const ref = ({ id, name, photo }: Entry): EntryRef => ({ id, name, photo });
const revealed = (entry: Entry): RevealedEntry => ({
  ...ref(entry),
  photo: entry.photo || (entry.shots?.[0] ?? ""),
  ...(entry.description && { description: entry.description }),
});

export const partyView = ({ viewer, ...input }: ViewInput): PartyView =>
  partyViews(input, [viewer]).get(viewer)!;

export function partyViews(
  input: Omit<ViewInput, "viewer">,
  viewers: readonly (number | null)[],
): Map<number | null, PartyView> {
  const { attributes, all, players, rounds } = input;
  const kind = input.game.kind ?? "classic";
  const entry = (id: number): Entry =>
    all.find((e) => e.id === id) ?? {
      id,
      name: "?",
      photo: "",
      values: attributes.map(() => ""),
    };
  const graded = (round: RoundData, playerId: number): GradedAttribute[][] =>
    round.guesses
      .filter((g) => g.playerId === playerId)
      .map((g) =>
        g.entryId === SKIP && isImageGame(kind)
          ? skippedRow()
          : gradeGuess(
              attributes,
              entry(round.answerId),
              entry(g.entryId),
              kind,
            ),
      );
  const latest = rounds.at(-1);
  let shared: Omit<LiveRound, "yours"> | null = null;
  let yoursOf: (mine: Progress | undefined) => LiveRound["yours"] = () => null;
  if (latest) {
    const answer = entry(latest.answerId);
    const quiz = latest.quiz;
    const hide = quiz !== undefined && latest.endedAt === null;
    shared = {
      number: latest.number,
      live: latest.endedAt === null,
      progress: participants(players, latest).map((p) => {
        const { playerId, guesses, solved, gaveUp, lost } = progressOf(
          latest,
          p.id,
        );
        return hide
          ? {
              playerId,
              guesses,
              solved: false,
              gaveUp: false,
              lost: false,
              answered: guesses > 0,
            }
          : { playerId, guesses, solved, gaveUp, lost };
      }),
      ...(quiz && { question: quiz.question }),
    };
    yoursOf = (mine) => {
      const used =
        mine && latest.hints?.find((h) => h.playerId === mine.playerId);
      const hint = used && revealHint(attributes, answer, used.pick);
      const hints =
        mine &&
        hintOffer(kind, attributes, answer, graded(latest, mine.playerId), {
          over: latest.endedAt !== null || isDone(mine),
          used: used !== undefined,
        });
      return !mine
        ? null
        : quiz
          ? {
              rows: [],
              solved: !hide && mine.solved,
              gaveUp: false,
              lost: !hide && mine.lost,
              quizAnswer:
                quiz.answers.find((a) => a.playerId === mine.playerId)?.text ??
                null,
            }
          : {
              rows: graded(latest, mine.playerId),
              solved: mine.solved,
              gaveUp: mine.gaveUp,
              lost: mine.lost,
              ...(isDone(mine) && { answer: revealed(answer) }),
              ...(hint && { hint }),
              ...(hints && { hints }),
            };
    };
  }
  const history = rounds
    .filter((r) => r.endedAt !== null)
    .map((r): FinishedRound => ({
      number: r.number,
      answer: revealed(entry(r.answerId)),
      ...(r.quiz && { right: r.quiz.right }),
      results: roundResults(players, r).map((res) => {
        const answer = r.quiz?.answers.find((a) => a.playerId === res.playerId);
        if (r.quiz) {
          return {
            ...res,
            guessNames: answer ? [answer.text] : [],
            grades: answer ? [[quizGrade(answer.points)]] : [],
          };
        }
        const rows = graded(r, res.playerId);
        return {
          ...res,
          guessNames: rows.map((row) => String(nameCell(row).value)),
          grades: rows.map((row) =>
            row.filter((cell) => !cell.image).map((cell) => cell.correctness),
          ),
        };
      }),
    }))
    .reverse();
  const game = {
    ...input.game,
    kind,
    guessMode: input.game.guessMode ?? "type",
    attributes: [...attributes],
    entries: input.entries.map((e) =>
      kind !== "classic"
        ? { ...ref(e), photo: "" }
        : { ...ref(e), values: e.values },
    ),
  };
  const standing = standings(players, rounds);
  return new Map(
    viewers.map((viewer) => {
      const me = players.find((p) => p.id === viewer);
      const view: PartyView = {
        code: input.code,
        game,
        ended: input.ended,
        you: me ? { playerId: me.id, host: me.host } : null,
        players: standing,
        round: shared && {
          ...shared,
          yours: yoursOf(me && latest && progressOf(latest, me.id)),
        },
        history,
      };
      return [viewer, view];
    }),
  );
}
