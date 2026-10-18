// Past days: the list a player picks an archive day from (GET /api/games/:slug/days).
import { outOfTries } from "./blur.ts";

// How far the player got on a day; "unplayed" also for anonymous players, whose
// progress lives in the browser
export type DayStatus = "won" | "gave-up" | "lost" | "playing" | "unplayed";

export interface DayItem {
  day: number;
  // "YYYY-MM-DD" in the server's time zone
  date: string;
  status: DayStatus;
}

export interface DaysResponse {
  today: number;
  // Blur games: tries per day, so the browser can tell a lost day; null for a classic game
  tries: number | null;
  // Newest first, today included
  days: DayItem[];
}

// What was played on a day
export interface DayProgress {
  won: boolean;
  gaveUp: boolean;
  // Skips included
  guesses: number;
}

// A day's status from what was played on it: a win beats a give-up beats used-up tries
// (Blur games; `tries` null for a classic game) beats guesses
export function statusOf(
  played: DayProgress,
  tries: number | null = null,
): DayStatus {
  if (played.won) {
    return "won";
  }
  if (played.gaveUp) {
    return "gave-up";
  }
  if (outOfTries(tries, played.guesses, false)) {
    return "lost";
  }
  return played.guesses > 0 ? "playing" : "unplayed";
}

// "Sat 17 Oct 2026" for a "YYYY-MM-DD" date, read as a calendar day (no time zone shift)
export function dayLabel(date: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).formatToParts(new Date(`${date}T00:00:00Z`));
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${part("weekday")} ${part("day")} ${part("month")} ${part("year")}`;
}

// The Play path for a day: today is the game's own page
export const dayPath = (slug: string, day: number, today: number): string =>
  day === today
    ? `/g/${encodeURIComponent(slug)}`
    : `/g/${encodeURIComponent(slug)}/day/${day}`;
