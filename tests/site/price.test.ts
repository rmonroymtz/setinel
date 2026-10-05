import { describe, expect, it } from "vitest";
import { parseMxn } from "../../src/site/price.ts";

describe("parseMxn", () => {
  it.each([
    ["$2,341.76", 2341.76],
    ["$1,220.67\nPrecio final MXN", 1220.67],
    ["  $740.35 MXN ", 740.35],
    ["MX$1,000", 1000],
    ["$12", 12],
    ["$1,234,567.89", 1234567.89],
  ])("parses %j", (text, expected) => {
    expect(parseMxn(text)).toBe(expected);
  });

  it("takes the first amount when several are shown (price and strike-through)", () => {
    expect(parseMxn("$740.35\n$780.29")).toBe(740.35);
  });

  it.each(["", "Precio no disponible", "$0.00", "$", "gratis"])("returns null for %j", (text) => {
    expect(parseMxn(text)).toBeNull();
  });
});
