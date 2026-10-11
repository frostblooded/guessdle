// Local calendar date as "Y-m-d" (month and day not zero-padded).
export function dateToString(date: Date): string {
  return "Y-m-d"
    .replace("Y", String(date.getFullYear()))
    .replace("m", String(date.getMonth() + 1))
    .replace("d", String(date.getDate()));
}
