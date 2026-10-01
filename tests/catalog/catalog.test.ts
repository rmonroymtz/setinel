import { describe, expect, it } from "vitest";
import { createRng } from "../../src/catalog/prng.ts";
import { NoAvailableProductError, pickAvailableProduct } from "../../src/catalog/pick-product.ts";
import { generateSeed } from "../../src/catalog/seed.ts";
import type { Candidate } from "../../src/catalog/pick-product.ts";

const candidate = (name: string, available = true): Candidate => ({
  name,
  url: `https://example.test/${name}`,
  available,
});

describe("createRng", () => {
  it("is deterministic for a given seed", () => {
    const a = createRng(42);
    const b = createRng(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it("differs across seeds and stays in [0, 1)", () => {
    const a = createRng(1)();
    const b = createRng(2)();
    expect(a).not.toBe(b);
    const rng = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("pickAvailableProduct", () => {
  const list = [candidate("a"), candidate("b", false), candidate("c"), candidate("d"), candidate("e", false)];

  it("never picks an unavailable product", () => {
    for (let seed = 0; seed < 200; seed++) {
      expect(pickAvailableProduct(list, seed).available).toBe(true);
    }
  });

  it("is deterministic for the same seed and list", () => {
    expect(pickAvailableProduct(list, 123)).toEqual(pickAvailableProduct(list, 123));
  });

  it("reaches every available product across seeds", () => {
    const names = new Set<string>();
    for (let seed = 0; seed < 200; seed++) names.add(pickAvailableProduct(list, seed).name);
    expect([...names].sort()).toEqual(["a", "c", "d"]);
  });

  it("keeps extra candidate fields", () => {
    const picked = pickAvailableProduct([{ ...candidate("x"), price: 99 }], 1);
    expect(picked).toMatchObject({ name: "x", price: 99 });
  });

  it("throws a typed failure when nothing is available", () => {
    expect(() => pickAvailableProduct([candidate("a", false)], 1)).toThrow(NoAvailableProductError);
    expect(() => pickAvailableProduct([], 1)).toThrow(/no available product/i);
  });

  it("reports how many candidates were seen", () => {
    try {
      pickAvailableProduct([candidate("a", false), candidate("b", false)], 1);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(NoAvailableProductError);
      expect((error as NoAvailableProductError).candidateCount).toBe(2);
    }
  });
});

describe("generateSeed", () => {
  it("uses the injected source and returns an unsigned 32-bit integer", () => {
    const seen: number[] = [];
    const seed = generateSeed((max) => {
      seen.push(max);
      return 5;
    });
    expect(seed).toBe(5);
    expect(seen).toEqual([2 ** 32]);
  });

  it("works with the default crypto source", () => {
    const seed = generateSeed();
    expect(Number.isInteger(seed)).toBe(true);
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(seed).toBeLessThan(2 ** 32);
  });
});
