export function parseNumberValue(raw: string): string | null {
  const text = raw.trim().replace(",", ".");
  return /^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(text) ? text : null;
}
