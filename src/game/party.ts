// Party mode (issue #90, ADR 0016): pure rules shared by the server and the party page.
// A round is won with the fewest guesses, ties broken by time from the round's start;
// rounds add up by placement points.
import type { Correctness } from "./correctness.ts";
import {
  hintChoices,
  isHintKind,
  revealHint,
  type FreeHint,
  type HintChoices,
  type HintKind,
  type HintPick,
} from "./free-hint.ts";
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
import { MAX_NICKNAME } from "./limits.ts";
import { outOfTries, type GameKind } from "./blur.ts";

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
}

export function progressOf(round: RoundData, playerId: number): Progress {
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
): boolean => p.solved || p.gaveUp || p.lost;

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

const better = (a: Progress, b: Progress): boolean =>
  a.guesses < b.guesses || (a.guesses === b.guesses && a.timeMs! < b.timeMs!);

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

// What every phone is sent: the live round shows only counts, a finished round everything
export interface PartyView {
  code: string;
  game: {
    slug: string;
    name: string;
    kind: GameKind;
    // Blur games: tries per round
    blurTries?: number;
    attributes: GameAttribute[];
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
  progress: Omit<Progress, "timeMs">[];
  // The viewer's own board; the answer once they solved it, gave up or ran out of tries
  yours: {
    rows: GradedAttribute[][];
    solved: boolean;
    gaveUp: boolean;
    lost: boolean;
    answer?: RevealedEntry;
    // Classic games: the Free Hint the viewer used, or the kinds on offer while unused
    hint?: FreeHint;
    hints?: HintChoices;
  } | null;
}

// An answer once revealed: the entry and its description, when it has one
export interface RevealedEntry extends EntryRef {
  description?: string;
}

export interface FinishedRound {
  number: number;
  answer: RevealedEntry;
  results: (RoundResult & {
    guessNames: string[];
    grades: Correctness[][];
  })[];
}

export interface ViewInput {
  code: string;
  game: { slug: string; name: string; kind?: GameKind; blurTries?: number };
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
const revealed = (entry: Entry): RevealedEntry => ({
  ...ref(entry),
  ...(entry.description && { description: entry.description }),
});

// The Free Hint a player used in a round, shown against its answer
export function hintOf(
  attributes: readonly GameAttribute[],
  answer: Entry,
  round: RoundData,
  playerId: number,
): FreeHint | null {
  const used = round.hints?.find((h) => h.playerId === playerId);
  return used ? revealHint(attributes, answer, used.pick) : null;
}

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
    const answer = entry(latest.answerId);
    const hint = mine && hintOf(attributes, answer, latest, mine.playerId);
    const hints =
      mine &&
      kind === "classic" &&
      latest.endedAt === null &&
      !isDone(mine) &&
      !hint
        ? hintChoices(attributes, answer, graded(latest, mine.playerId))
        : null;
    round = {
      number: latest.number,
      live: latest.endedAt === null,
      progress: participants(players, latest).map((p) => {
        const { playerId, guesses, solved, gaveUp, lost } = progressOf(
          latest,
          p.id,
        );
        return { playerId, guesses, solved, gaveUp, lost };
      }),
      yours: mine
        ? {
            rows: graded(latest, mine.playerId),
            solved: mine.solved,
            gaveUp: mine.gaveUp,
            lost: mine.lost,
            ...(isDone(mine) && { answer: revealed(answer) }),
            ...(hint && { hint }),
            ...(hints && { hints }),
          }
        : null,
    };
  }
  const history = rounds
    .filter((r) => r.endedAt !== null)
    .map((r): FinishedRound => ({
      number: r.number,
      answer: revealed(entry(r.answerId)),
      results: roundResults(players, r).map((res) => {
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
      attributes: [...attributes],
      entries: input.entries.map((e) => ({
        ...ref(e),
        photo: kind === "blur" ? "" : e.photo,
      })),
    },
    ended: input.ended,
    you: me ? { playerId: me.id, host: me.host } : null,
    players: standings(players, rounds),
    round,
    history,
  };
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
