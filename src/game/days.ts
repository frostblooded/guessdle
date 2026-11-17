import { outOfTries } from "./blur.ts";

export type DayStatus = "won" | "gave-up" | "lost" | "playing" | "unplayed";

export interface DayItem {
  day: number;
  date: string;
  status: DayStatus;
}

export interface DaysResponse {
  today: number;
  tries: number | null;
  days: DayItem[];
}

export interface DayProgress {
  won: boolean;
  gaveUp: boolean;
  guesses: number;
}

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

export const dayPath = (slug: string, day: number, today: number): string =>
  day === today
    ? `/g/${encodeURIComponent(slug)}`
    : `/g/${encodeURIComponent(slug)}/day/${day}`;
