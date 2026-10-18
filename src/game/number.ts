// Number attribute values: stored as the text the owner typed, with a dot for decimals.

// The value as stored (trimmed, "," read as the decimal point), or null when it is not a number
export function parseNumberValue(raw: string): string | null {
  const text = raw.trim().replace(",", ".");
  return /^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(text) ? text : null;
}
