import { randomInt } from "node:crypto";

/** Kept apart from selection so tests can pass a fixed seed directly. */
export function generateSeed(source: (max: number) => number = (max) => randomInt(max)): number {
  return source(2 ** 32);
}
