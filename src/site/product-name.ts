const normalizeName = (name: string) => name.normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();

/** Pages render the same product name with different case and spacing; compare it without them. */
export function sameProductName(a: string, b: string): boolean {
  const left = normalizeName(a);
  return left !== "" && left === normalizeName(b);
}
