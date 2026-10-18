// Party mode (ADR 0016): what each phone is sent of a party, built from its players and rounds.
// A live round shows only counts, a finished round everything.
import type { GameKind } from "./blur.ts";
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

// What every phone is sent: the live round shows only counts, a finished round everything
export interface PartyView {
  code: string;
  game: {
    slug: string;
    name: string;
    kind: GameKind;
    // Blur games: tries per round
    blurTries?: number;
    // Quiz games: how many questions there are, one per round
    questions?: number;
    attributes: GameAttribute[];
    // How every player picks a guess, set by the host when opening the party
    guessMode: GuessMode;
    // A Blur game's entries come without photos
    entries: EntryRef[];
  };
  ended: boolean;
  // The viewer's own player, or null for a visitor who has not joined
  you: { playerId: number; host: boolean } | null;
  players: Standing[];
  // The latest round, live or finished; null before the first
  round: LiveRound | null;
  // Finished rounds, newest first
  history: FinishedRound[];
}

export interface LiveRound {
  number: number;
  live: boolean;
  // A Quiz round shows only who answered, never whether it was right, until it ends
  progress: (Omit<Progress, "timeMs" | "score"> & { answered?: boolean })[];
  // Quiz games: the question to answer
  question?: QuizQuestion;
  // The viewer's own board; the answer once they solved it, gave up or ran out of tries
  yours: {
    rows: GradedAttribute[][];
    solved: boolean;
    gaveUp: boolean;
    lost: boolean;
    answer?: EntryRef;
    // Quiz games: the viewer's answer as text, null before answering
    quizAnswer?: string | null;
  } | null;
}

export interface FinishedRound {
  number: number;
  // A Quiz round's question: its text as the name, its picture as the photo
  answer: EntryRef;
  // Quiz games: the right answer
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
  // Active entries (offered to guess) and every entry (so old guesses still resolve)
  entries: readonly Entry[];
  all: readonly Entry[];
  ended: boolean;
  players: readonly PartyPlayer[];
  // Oldest first
  rounds: readonly RoundData[];
  viewer: number | null;
}

const ref = ({ id, name, photo }: Entry): EntryRef => ({ id, name, photo });

export function partyView(input: ViewInput): PartyView {
  const { attributes, all, players, rounds, viewer } = input;
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
        g.entryId === SKIP && kind === "blur"
          ? skippedRow()
          : gradeGuess(
              attributes,
              entry(round.answerId),
              entry(g.entryId),
              kind,
            ),
      );
  const latest = rounds.at(-1);
  const me = players.find((p) => p.id === viewer);
  let round: LiveRound | null = null;
  if (latest) {
    const mine = me && progressOf(latest, me.id);
    // A live Quiz round keeps everyone's points secret
    const quiz = latest.quiz;
    const hide = quiz !== undefined && latest.endedAt === null;
    round = {
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
      yours: !mine
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
              ...(isDone(mine) && { answer: ref(entry(latest.answerId)) }),
            },
    };
  }
  const history = rounds
    .filter((r) => r.endedAt !== null)
    .map((r): FinishedRound => ({
      number: r.number,
      answer: ref(entry(r.answerId)),
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
          // Image columns are never colored, so they get no square
          grades: rows.map((row) =>
            row.filter((cell) => !cell.image).map((cell) => cell.correctness),
          ),
        };
      }),
    }))
    .reverse();
  return {
    code: input.code,
    game: {
      ...input.game,
      kind,
      guessMode: input.game.guessMode ?? "type",
      attributes: [...attributes],
      entries: input.entries.map((e) =>
        kind !== "classic"
          ? { ...ref(e), photo: "" }
          : { ...ref(e), values: e.values },
      ),
    },
    ended: input.ended,
    you: me ? { playerId: me.id, host: me.host } : null,
    players: standings(players, rounds),
    round,
    history,
  };
}
