import type { Candidate } from "../catalog/pick-product.ts";
import type { Page } from "../ports/browser.ts";

/** Shared, mutable state the steps hand to each other. */
export interface JourneyContext {
  page: Page;
  baseUrl: string;
  searchTerm: string;
  seed: number;
  /** Filled by the search step. `available` is flipped off when the PDP shows the product sold out. */
  candidates: Candidate[];
  product?: Candidate;
  /** What the product page showed for the picked product, set by the pdp step when its checks pass. */
  pdp?: { title: string; priceMxn: number };
}
