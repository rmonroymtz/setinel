import type { JourneyStep } from "../journey/run-journey.ts";
import type { ArtifactStore } from "../ports/artifact-store.ts";
import type { Page } from "../ports/browser.ts";
import type { JourneyContext } from "./context.ts";
import { guestProfileFromEnv, type GuestProfile } from "../site/guest-profile.ts";
import { addToCartStep } from "./add-to-cart.ts";
import { checkoutStep } from "./checkout.ts";
import { homeStep } from "./home.ts";
import { instrumentStep } from "./instrument.ts";
import { pdpStep } from "./pdp.ts";
import { pickProductStep } from "./pick-product.ts";
import { searchStep } from "./search.ts";

/**
 * The guest journey from home to the payment screen, with evidence capture on
 * every step. The guest defaults to the synthetic profile, overridable through
 * `SENTINEL_GUEST_*` variables.
 */
export function buildSteps(deps: { page: Page; store: ArtifactStore; guest?: GuestProfile }): JourneyStep<JourneyContext>[] {
  const guest = deps.guest ?? guestProfileFromEnv(process.env);
  return [homeStep, searchStep, pickProductStep, pdpStep, addToCartStep, checkoutStep(guest)].map((step) =>
    instrumentStep(step, deps),
  );
}
