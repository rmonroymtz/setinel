import { describe, expect, it } from "vitest";
import { findHashedClassSelectors, orderPlacingDenylist, selectors } from "../../src/site/selectors.ts";

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

describe("order-placing denylist", () => {
  it("is anchored without build hashes either", () => {
    const entries = Object.fromEntries(orderPlacingDenylist.selectors.map((v, i) => [String(i), v]));
    expect(findHashedClassSelectors(entries)).toEqual([]);
  });

  it("covers the place-order button and the payment section", () => {
    expect(orderPlacingDenylist.selectors).toEqual(
      expect.arrayContaining(['[class*="placeOrderButton-"]', '[data-block="payment_method"]']),
    );
  });
});
