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

export const CODE_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
export const CODE_LENGTH = 4;

export const randomCode = (random: () => number): string =>
  Array.from(
    { length: CODE_LENGTH },
    () => CODE_LETTERS[Math.floor(random() * CODE_LETTERS.length)]!,
  ).join("");

export function normalizeCode(input: string): string | null {
  const code = input.trim().toUpperCase();
  return new RegExp(`^[${CODE_LETTERS}]{${CODE_LENGTH}}$`).test(code)
    ? code
    : null;
}

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
  joinedAt: number;
}

export interface RoundData {
  number: number;
  answerId: number;
  startedAt: number;
  endedAt: number | null;
  guesses: { playerId: number; entryId: number; at: number }[];
  giveUps: { playerId: number; at: number }[];
  hints?: { playerId: number; pick: HintPick }[];
  tries?: number;
  quiz?: QuizRound;
}

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
  lost: boolean;
  timeMs: number | null;
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
  place: number | null;
  points: number;
}

const better = (a: Progress, b: Progress): boolean => {
  const [mine, theirs] =
    a.score === undefined ? [b.guesses, a.guesses] : [a.score, b.score!];
  return mine > theirs || (mine === theirs && a.timeMs! < b.timeMs!);
};

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
  place: number;
}

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

export function drawAnswer(
  activeIds: readonly number[],
  used: readonly number[],
  random: () => number,
): number {
  const fresh = activeIds.filter((id) => !used.includes(id));
  const pool = fresh.length > 0 ? fresh : activeIds;
  return pool[Math.floor(random() * pool.length)]!;
}

export type ClientMessage =
  | { type: "hello"; token?: string }
  | { type: "guess"; entryId: number }
  | { type: "answer"; answer: string }
  | { type: "give-up" }
  | { type: "hint"; kind: HintKind }
  | { type: "start-round" }
  | { type: "end-round" }
  | { type: "remove-player"; playerId: number }
  | { type: "end-party" };

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

export const CLOSE_REMOVED = 4001;
