import type { JourneyStep } from "../journey/run-journey.ts";
import type { ArtifactStore } from "../ports/artifact-store.ts";
import type { Page } from "../ports/browser.ts";
import type { JourneyContext } from "./context.ts";
import { addToCartStep } from "./add-to-cart.ts";
import { homeStep } from "./home.ts";
import { instrumentStep } from "./instrument.ts";
import { pdpStep } from "./pdp.ts";
import { pickProductStep } from "./pick-product.ts";
import { searchStep } from "./search.ts";

/** The guest journey from home to the cart, with evidence capture on every step. */
export function buildSteps(deps: { page: Page; store: ArtifactStore }): JourneyStep<JourneyContext>[] {
  return [homeStep, searchStep, pickProductStep, pdpStep, addToCartStep].map((step) => instrumentStep(step, deps));
}
