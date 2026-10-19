// Victory stats: how today's winners did, and how one player compares to them.
import { call, type Fetch } from "./transport.ts";

// Guess counts above this share the last bar ("10+")
export const MAX_GUESS_BAR = 10;

// Time buckets: each is "under `upTo` seconds", the last has no limit
export const TIME_BUCKETS: readonly { label: string; upTo: number }[] = [
  { label: "< 30s", upTo: 30 },
  { label: "30s-1m", upTo: 60 },
  { label: "1-2m", upTo: 120 },
  { label: "2-5m", upTo: 300 },
  { label: "5-10m", upTo: 600 },
  { label: "10m+", upTo: Infinity },
];

// A solve longer than a day is not a real time
export const MAX_SECONDS = 24 * 60 * 60;

export interface WinResult {
  guesses: number;
  // From the first guess to the winning one; null when unknown
  seconds: number | null;
}

// POST /api/games/:slug/result
export interface DayStats {
  day: number;
  // This player's first win today; null if it is not recorded
  you: WinResult | null;
  // Winners today, this player included
  players: number;
  // guesses[i]: winners who took i + 1 guesses; the last counts MAX_GUESS_BAR or more
  guesses: number[];
  // times[i]: winners whose time falls in TIME_BUCKETS[i]
  times: number[];
  // Percent of the other winners who took more guesses / longer; null with no one to compare to
  fewerGuessesThan: number | null;
  fasterThan: number | null;
  // The player's first attempt today ended without a win (a give-up or out of tries), so
  // no later win that day counts; `you` is then null
  firstTryFailed?: true;
}

export const guessBar = (guesses: number): number =>
  Math.min(guesses, MAX_GUESS_BAR) - 1;

export const timeBucket = (seconds: number): number =>
  TIME_BUCKETS.findIndex((bucket) => seconds < bucket.upTo);

// Percent of `others` that `beats` returns true for, rounded; null when there are none
function share<T>(others: readonly T[], beats: (other: T) => boolean) {
  return others.length === 0
    ? null
    : Math.round((100 * others.filter(beats).length) / others.length);
}

// Today's results, with `you` the player's own (also among `results`) or null
export function summarize(
  day: number,
  results: readonly WinResult[],
  you: WinResult | null,
): DayStats {
  const guesses = new Array<number>(MAX_GUESS_BAR).fill(0);
  const times = new Array<number>(TIME_BUCKETS.length).fill(0);
  for (const result of results) {
    guesses[guessBar(result.guesses)]! += 1;
    if (result.seconds !== null) {
      times[timeBucket(result.seconds)]! += 1;
    }
  }
  // Everyone but the player: their own result is one entry of `results`
  const others = you === null ? results : withoutOne(results, you);
  const mySeconds = you?.seconds ?? null;
  return {
    day,
    you,
    players: results.length,
    guesses,
    times,
    fewerGuessesThan:
      you === null ? null : share(others, (o) => o.guesses > you.guesses),
    fasterThan:
      mySeconds === null
        ? null
        : share(
            others.filter((o) => o.seconds !== null),
            (o) => o.seconds! > mySeconds,
          ),
  };
}

function withoutOne(
  results: readonly WinResult[],
  you: WinResult,
): WinResult[] {
  const i = results.findIndex(
    (r) => r.guesses === you.guesses && r.seconds === you.seconds,
  );
  return i === -1 ? [...results] : results.filter((_, j) => j !== i);
}

// Seconds as "42s", "3m 05s" or "1h 02m"
export function formatSeconds(seconds: number): string {
  const s = Math.floor(seconds);
  if (s < 60) {
    return `${s}s`;
  }
  const pad = (n: number): string => String(n).padStart(2, "0");
  if (s < 3600) {
    return `${Math.floor(s / 60)}m ${pad(s % 60)}s`;
  }
  return `${Math.floor(s / 3600)}h ${pad(Math.floor(s / 60) % 60)}m`;
}

// The browser's random player token, so an anonymous player counts once a day.
// Blocked storage gets a token for this page view only.
const PLAYER_KEY = "guessdle:player";
let memoryToken: string | null = null;
export function playerToken(
  storage: Pick<Storage, "getItem" | "setItem">,
  random: () => string = () => crypto.randomUUID(),
): string {
  try {
    const stored = storage.getItem(PLAYER_KEY);
    if (stored !== null && isPlayerToken(stored)) {
      return stored;
    }
    const token = random();
    storage.setItem(PLAYER_KEY, token);
    return token;
  } catch {
    memoryToken ??= random();
    return memoryToken;
  }
}

export const isPlayerToken = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9-]{16,64}$/.test(value);

// Records the player's win (only the first one of the day counts) and returns
// the day's stats, or null if the server could not be reached
export async function fetchStats(
  fetch: Fetch,
  slug: string,
  body: { ids: number[]; seconds: number | null; player: string },
  // A past day's Day Number; today when absent
  day?: number,
): Promise<DayStats | null> {
  const res = await call(
    fetch,
    `/api/games/${encodeURIComponent(slug)}/result${day === undefined ? "" : `?day=${day}`}`,
    body,
  );
  return res?.ok ? (res.data as DayStats) : null;
}
