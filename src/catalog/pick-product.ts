import { createRng } from "./prng.ts";

export interface Candidate {
  name: string;
  url: string;
  available: boolean;
}

export class NoAvailableProductError extends Error {
  readonly candidateCount: number;

  constructor(candidateCount: number) {
    super(`No available product among ${candidateCount} candidate(s)`);
    this.name = "NoAvailableProductError";
    this.candidateCount = candidateCount;
  }
}

export function pickAvailableProduct<T extends Candidate>(candidates: readonly T[], seed: number): T {
  const available = candidates.filter((c) => c.available);
  if (available.length === 0) throw new NoAvailableProductError(candidates.length);
  const index = Math.floor(createRng(seed)() * available.length);
  return available[index] as T;
}
