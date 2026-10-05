/** Parses the first MXN amount in the text ("$2,341.76", "MX$1,000"); null if none or not positive. */
export function parseMxn(text: string): number | null {
  const match = /\$\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?/.exec(text);
  if (!match) return null;
  const amount = Number(`${match[1]!.replaceAll(",", "")}.${match[2] ?? "0"}`);
  return amount > 0 ? amount : null;
}

/** Whole cents, so amounts parsed from different pages compare without floating-point noise. */
export const toCents = (mxn: number) => Math.round(mxn * 100);
