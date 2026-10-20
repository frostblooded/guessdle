// Party mode (issue #90, ADR 0016): pure rules shared by the server and the party page.
// A round is won with the fewest guesses, ties broken by time from the round's start;
// rounds add up by placement points. A Quiz game's round is one question (ADR 0021): the most
// quiz points win it, ties broken by time, and a wrong answer gets no placement points.
import { isOver } from "./board.ts";
import { isHintKind, type HintKind, type HintPick } from "./free-hint.ts";
import { MAX_NICKNAME } from "./limits.ts";
import { outOfTries } from "./blur.ts";
import type { QuizRound } from "./quiz.ts";
import type { PartyView } from "./party-view.ts";

export type {
  FinishedRound,
  LiveRound,
  PartyView,
  ViewInput,
} from "./party-view.ts";

// No I or O, so a code read aloud or off a screen is never mistaken for 1 or 0
export const CODE_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
export const CODE_LENGTH = 4;

export const randomCode = (random: () => number): string =>
  Array.from(
    { length: CODE_LENGTH },
    () => CODE_LETTERS[Math.floor(random() * CODE_LETTERS.length)]!,
  ).join("");

// The code typed or in a URL, upper-cased; null when it cannot be one
export function normalizeCode(input: string): string | null {
  const code = input.trim().toUpperCase();
  return new RegExp(`^[${CODE_LETTERS}]{${CODE_LENGTH}}$`).test(code)
    ? code
    : null;
}

// A nickname with its spaces collapsed, or null when empty, too long or holding control characters
export function cleanNickname(input: unknown): string | null {
  if (typeof input !== "string") {
    return null;
  }
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(input)) {
    return null;
  }
  const name = input.trim().replace(/\s+/g, " ");
  return name.length >= 1 && [...name].length <= MAX_NICKNAME ? name : null;
}

export interface PartyPlayer {
  id: number;
  nickname: string;
  host: boolean;
  // Epoch ms
  joinedAt: number;
}

export interface RoundData {
  number: number;
  answerId: number;
  // Epoch ms; endedAt is null while the round is live
  startedAt: number;
  endedAt: number | null;
  // In the order they were made
  guesses: { playerId: number; entryId: number; at: number }[];
  giveUps: { playerId: number; at: number }[];
  // Classic games: the Free Hints players used, at most one each
  hints?: { playerId: number; pick: HintPick }[];
  // Blur games: guesses each player gets (ADR 0019); unlimited when absent
  tries?: number;
  // Quiz games: the round's question, its right answer and each player's one answer, graded
  quiz?: QuizRound;
}

// Who plays a round: everyone in the party when it ended (or now, while live), late joiners too
export const participants = (
  players: readonly PartyPlayer[],
  round: RoundData,
): PartyPlayer[] =>
  players.filter((p) => p.joinedAt <= (round.endedAt ?? Infinity));

export interface Progress {
  playerId: number;
  guesses: number;
  solved: boolean;
  gaveUp: boolean;
  // Blur games: used every try without solving it
  lost: boolean;
  // From the round's start to the solving guess
  timeMs: number | null;
  // Quiz games: the answer's quiz points (0 to 1), absent before answering. An answer with
  // points counts as solved, one without as lost.
  score?: number;
}

export function progressOf(round: RoundData, playerId: number): Progress {
  if (round.quiz) {
    const answer = round.quiz.answers.find((a) => a.playerId === playerId);
    return {
      playerId,
      guesses: answer ? 1 : 0,
      solved: answer !== undefined && answer.points > 0,
      gaveUp: false,
      lost: answer !== undefined && answer.points === 0,
      timeMs: answer ? answer.at - round.startedAt : null,
      ...(answer && { score: answer.points }),
    };
  }
  const mine = round.guesses.filter((g) => g.playerId === playerId);
  const solving = mine.find((g) => g.entryId === round.answerId);
  return {
    playerId,
    guesses: mine.length,
    solved: solving !== undefined,
    gaveUp: round.giveUps.some((g) => g.playerId === playerId),
    lost: outOfTries(round.tries, mine.length, solving !== undefined),
    timeMs: solving ? solving.at - round.startedAt : null,
  };
}

export const isDone = (
  p: Pick<Progress, "solved" | "gaveUp" | "lost">,
): boolean => isOver({ won: p.solved, gaveUp: p.gaveUp, lost: p.lost });

// A live round ends by itself once every player has solved it, given up or run out of tries
export function everyoneDone(
  players: readonly PartyPlayer[],
  round: RoundData,
): boolean {
  const playing = participants(players, round);
  return (
    playing.length > 0 && playing.every((p) => isDone(progressOf(round, p.id)))
  );
}

export interface RoundResult extends Progress {
  // 1-based; null when not solved. Equal guesses and time share a place.
  place: number | null;
  points: number;
}

// Fewer guesses, or in a Quiz game more points, then less time
const better = (a: Progress, b: Progress): boolean => {
  const [mine, theirs] =
    a.score === undefined ? [b.guesses, a.guesses] : [a.score, b.score!];
  return mine > theirs || (mine === theirs && a.timeMs! < b.timeMs!);
};

// Placement points: with N players, 1st gets N, 2nd N - 1, and so on; unsolved gets 0
export function roundResults(
  players: readonly PartyPlayer[],
  round: RoundData,
): RoundResult[] {
  const playing = participants(players, round);
  const all = playing.map((p) => progressOf(round, p.id));
  const solved = all.filter((p) => p.solved);
  return all
    .map((p): RoundResult => {
      if (!p.solved) {
        return { ...p, place: null, points: 0 };
      }
      const place = 1 + solved.filter((other) => better(other, p)).length;
      return { ...p, place, points: playing.length - place + 1 };
    })
    .sort(
      (a, b) =>
        (a.place ?? Infinity) - (b.place ?? Infinity) ||
        Number(b.gaveUp) - Number(a.gaveUp) ||
        a.playerId - b.playerId,
    );
}

export interface Standing {
  id: number;
  nickname: string;
  host: boolean;
  points: number;
  // 1-based; equal points share a place
  place: number;
}

// The party's scoreboard over its finished rounds, most points first
export function standings(
  players: readonly PartyPlayer[],
  rounds: readonly RoundData[],
): Standing[] {
  const points = new Map<number, number>(players.map((p) => [p.id, 0]));
  for (const round of rounds.filter((r) => r.endedAt !== null)) {
    for (const r of roundResults(players, round)) {
      points.set(r.playerId, (points.get(r.playerId) ?? 0) + r.points);
    }
  }
  const totals = players.map((p) => ({ ...p, points: points.get(p.id)! }));
  return totals
    .map(({ id, nickname, host, points: mine }) => ({
      id,
      nickname,
      host,
      points: mine,
      place: 1 + totals.filter((o) => o.points > mine).length,
    }))
    .sort(
      (a, b) =>
        b.points - a.points ||
        a.nickname.localeCompare(b.nickname) ||
        a.id - b.id,
    );
}

// The next secret entry: random among active entries this party has not had yet (all of them once used up)
export function drawAnswer(
  activeIds: readonly number[],
  used: readonly number[],
  random: () => number,
): number {
  const fresh = activeIds.filter((id) => !used.includes(id));
  const pool = fresh.length > 0 ? fresh : activeIds;
  return pool[Math.floor(random() * pool.length)]!;
}

// Messages a phone sends over the party socket
export type ClientMessage =
  | { type: "hello"; token?: string }
  | { type: "guess"; entryId: number }
  // Quiz games: the one answer to the round's question
  | { type: "answer"; answer: string }
  | { type: "give-up" }
  | { type: "hint"; kind: HintKind }
  | { type: "start-round" }
  | { type: "end-round" }
  | { type: "remove-player"; playerId: number }
  | { type: "end-party" };

// Messages the server sends: the whole view on every change, or why an action was refused
export type ServerMessage =
  | { type: "view"; view: PartyView }
  | { type: "error"; error: PartyRefusal }
  | { type: "removed" };

export type PartyRefusal =
  | "invalid"
  | "not_host"
  | "not_player"
  | "no_round"
  | "round_live"
  | "finished"
  | "duplicate"
  | "party_ended"
  | "not_enough_entries"
  | "game_paused"
  | "no_hint"
  | "no_questions_left"
  | "server_error";

const ACTIONS = new Set(["give-up", "start-round", "end-round", "end-party"]);

// A socket frame as a message, or null when it is not one
export function parseClientMessage(raw: string): ClientMessage | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null) {
    return null;
  }
  const msg = data as Record<string, unknown>;
  switch (msg["type"]) {
    case "hello":
      return msg["token"] === undefined
        ? { type: "hello" }
        : typeof msg["token"] === "string" && msg["token"].length <= 100
          ? { type: "hello", token: msg["token"] }
          : null;
    case "guess":
      return Number.isInteger(msg["entryId"])
        ? { type: "guess", entryId: msg["entryId"] as number }
        : null;
    case "answer":
      return typeof msg["answer"] === "string" && msg["answer"].length <= 40
        ? { type: "answer", answer: msg["answer"] }
        : null;
    case "hint":
      return isHintKind(msg["kind"])
        ? { type: "hint", kind: msg["kind"] }
        : null;
    case "remove-player":
      return Number.isInteger(msg["playerId"])
        ? { type: "remove-player", playerId: msg["playerId"] as number }
        : null;
    default:
      return ACTIONS.has(String(msg["type"]))
        ? ({ type: msg["type"] } as ClientMessage)
        : null;
  }
}

// The socket close code for a player the host removed
export const CLOSE_REMOVED = 4001;
