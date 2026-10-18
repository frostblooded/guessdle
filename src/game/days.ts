// Past days: the list a player picks an archive day from (GET /api/games/:slug/days).

// How far the player got on a day; "unplayed" also for anonymous players, whose
// progress lives in the browser
export type DayStatus = "won" | "gave-up" | "playing" | "unplayed";

export interface DayItem {
  day: number;
  // "YYYY-MM-DD" in the server's time zone
  date: string;
  status: DayStatus;
}

export interface DaysResponse {
  today: number;
  // Newest first, today included
  days: DayItem[];
}

// A day's status from what was played on it: a win beats a give-up beats guesses
export function statusOf(played: {
  won: boolean;
  gaveUp: boolean;
  guesses: number;
}): DayStatus {
  if (played.won) {
    return "won";
  }
  if (played.gaveUp) {
    return "gave-up";
  }
  return played.guesses > 0 ? "playing" : "unplayed";
}

// An anonymous player's status on a day, from the browser's Game State
export function localStatus(state: {
  getWon(): boolean;
  getGaveUp(): boolean;
  getUsedGuesses(): number[];
}): DayStatus {
  return statusOf({
    won: state.getWon(),
    gaveUp: state.getGaveUp(),
    guesses: state.getUsedGuesses().length,
  });
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
