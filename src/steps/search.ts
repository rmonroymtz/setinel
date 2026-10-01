import type { Candidate } from "../catalog/pick-product.ts";
import type { JourneyStep } from "../journey/run-journey.ts";
import { selectors } from "../site/selectors.ts";
import type { JourneyContext } from "./context.ts";

const RESULTS_TIMEOUT_MS = 20_000;

export const searchStep: JourneyStep<JourneyContext> = {
  name: "search",
  async run(context) {
    const { page, searchTerm } = context;
    await page.submit(selectors.searchInput, searchTerm);

    if (!(await page.waitFor(selectors.resultLink, "visible", RESULTS_TIMEOUT_MS))) {
      return { status: "fail", error: { message: `Search for "${searchTerm}" returned no products` } };
    }
    // The first store's cards show up while the others still shimmer; collecting
    // now would miss products and pass a page a shopper sees as stuck loading.
    if (!(await page.waitFor(selectors.loadingPlaceholder, "gone", RESULTS_TIMEOUT_MS))) {
      return {
        status: "fail",
        error: { message: `Search results for "${searchTerm}" were still loading after ${RESULTS_TIMEOUT_MS / 1000}s` },
      };
    }

    const seen = new Set<string>();
    const candidates: Candidate[] = [];
    for (const link of await page.queryAll(selectors.resultLink)) {
      if (!link.href || seen.has(link.href)) continue;
      seen.add(link.href);
      // The listing does not show stock; the PDP decides, so every card starts as a candidate.
      candidates.push({ name: cardName(link.text) || link.alt || link.href, url: link.href, available: true });
    }

    if (candidates.length === 0) {
      return { status: "fail", error: { message: `Search for "${searchTerm}" showed cards without product links` } };
    }
    context.candidates = candidates;
    return { status: "ok", metadata: { term: searchTerm, resultCount: candidates.length } };
  },
};

function cardName(text: string): string {
  return text.split("\n").map((l) => l.trim()).find((l) => l.length > 0) ?? "";
}
