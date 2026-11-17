export function dateToString(date: Date): string {
  return "Y-m-d"
    .replace("Y", String(date.getFullYear()))
    .replace("m", String(date.getMonth() + 1))
    .replace("d", String(date.getDate()));
}

export function dateOfDay(day: number, start: string): string {
  return new Date(Date.parse(`${start}T00:00:00Z`) + day * 86_400_000)
    .toISOString()
    .slice(0, 10);
}
