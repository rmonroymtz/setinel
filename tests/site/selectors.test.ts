import { describe, expect, it } from "vitest";
import { findHashedClassSelectors, selectors } from "../../src/site/selectors.ts";

describe("selectors", () => {
  it("never anchor on a CSS-module class with its build hash", () => {
    expect(findHashedClassSelectors(selectors)).toEqual([]);
  });

  it("the guard itself flags hashed classes", () => {
    expect(
      findHashedClassSelectors({
        dotted: ".productCarousel-root-tyD",
        attribute: '[class*="productCarousel-root-tyD"]',
        prefix: '[class*="productCarousel-root-"]',
        role: 'role=button[name="Agregar al carrito"i]',
      }),
    ).toEqual(["dotted", "attribute"]);
  });
});
