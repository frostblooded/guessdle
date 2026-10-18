// Local calendar date as "Y-m-d" (month and day not zero-padded).
export function dateToString(date: Date): string {
  return "Y-m-d"
    .replace("Y", String(date.getFullYear()))
    .replace("m", String(date.getMonth() + 1))
    .replace("d", String(date.getDate()));
}

// The "YYYY-MM-DD" date of Day Number `day` for a game whose day 0 is `start`
export function dateOfDay(day: number, start: string): string {
  return new Date(Date.parse(`${start}T00:00:00Z`) + day * 86_400_000)
    .toISOString()
    .slice(0, 10);
}
