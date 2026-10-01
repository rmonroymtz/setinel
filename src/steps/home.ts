import type { JourneyStep } from "../journey/run-journey.ts";
import { selectors } from "../site/selectors.ts";
import type { JourneyContext } from "./context.ts";
import { navigate } from "./navigate.ts";

const SEARCH_BOX_TIMEOUT_MS = 15_000;

export const homeStep: JourneyStep<JourneyContext> = {
  name: "home",
  async run({ page, baseUrl }) {
    const nav = await navigate(page, baseUrl);
    // A page that answered and has text, but never shows its search box, is broken, not unseen.
    if (!(await page.waitFor(selectors.searchInput, "visible", SEARCH_BOX_TIMEOUT_MS))) {
      return { status: "fail", error: { message: "Home rendered without a search box" } };
    }
    return { status: "ok", metadata: { httpStatus: nav.status, title: nav.title } };
  },
};
