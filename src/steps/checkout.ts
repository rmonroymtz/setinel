import type { JourneyStep, StepOutcome } from "../journey/run-journey.ts";
import type { GuestProfile } from "../site/guest-profile.ts";
import { parseMxn, toCents } from "../site/price.ts";
import { sameProductName } from "../site/product-name.ts";
import { selectors } from "../site/selectors.ts";
import type { JourneyContext } from "./context.ts";
import { navigate } from "./navigate.ts";
import { safeClick } from "./safe-click.ts";

// The checkout form renders after the cart and store config queries resolve.
const FORM_TIMEOUT_MS = 20_000;
// Google Places answered in under a second on the live site.
const SUGGESTION_TIMEOUT_MS = 15_000;
// Picking a suggestion reveals the detailed address fields at once.
const ADDRESS_FIELDS_TIMEOUT_MS = 10_000;
// Each section opens after a GraphQL mutation saves the previous one (~1-3s observed).
const SECTION_TIMEOUT_MS = 20_000;
// The shipping method is preselected; give its button a moment before choosing one.
const PRESELECTED_TIMEOUT_MS = 5_000;

/**
 * Checks out the cart as a guest with the synthetic profile and stops on the
 * payment screen: address, shipping method, then payment methods listed next to
 * an order summary whose subtotal must equal the product page price to the cent.
 *
 * It never chooses a payment method nor clicks "Finalizar compra": every click
 * goes through `safeClick`, which refuses the order-placing denylist. The cart's
 * own checkout button also reads "Finalizar compra", so `/checkout` is opened by URL.
 */
export function checkoutStep(guest: GuestProfile): JourneyStep<JourneyContext> {
  return {
    name: "checkout",
    async run(context): Promise<StepOutcome> {
      const { page, pdp } = context;
      if (!context.product || !pdp) throw new Error("checkout step ran without a checked product page");

      const checkoutUrl = new URL("/checkout", context.baseUrl).href;
      await navigate(page, checkoutUrl);
      const base: Record<string, unknown> = { checkoutUrl, title: pdp.title, pdpPriceMxn: pdp.priceMxn, guestEmail: guest.email };

      if (!(await page.waitFor(selectors.guestEmail, "visible", FORM_TIMEOUT_MS))) {
        return fail("Checkout shows no guest contact form (guest checkout unavailable or not rendered)", base);
      }
      await page.fill(selectors.guestEmail, guest.email);
      await page.fill(selectors.guestFirstName, guest.firstName);
      await page.fill(selectors.guestLastName, guest.lastName);
      await page.fill(selectors.guestPhone, guest.phone);

      await page.type(selectors.addressAutocomplete, guest.address);
      if (!(await page.waitFor(selectors.addressSuggestion, "visible", SUGGESTION_TIMEOUT_MS))) {
        return fail(`The address search showed no address suggestion for "${guest.address}"`, base);
      }
      await safeClick(page, selectors.addressSuggestion);
      if (!(await page.waitFor(selectors.addressStreet, "visible", ADDRESS_FIELDS_TIMEOUT_MS))) {
        return fail("Picking an address suggestion did not reveal the address fields", base);
      }
      await page.fill(selectors.addressReferences, guest.references);

      // The address may already have been saved by the site; then the button is gone.
      if (await page.waitFor(selectors.saveAddress, "enabled", SECTION_TIMEOUT_MS)) {
        await safeClick(page, selectors.saveAddress);
      }
      if (!(await page.waitFor(selectors.shippingMethodOpen, "visible", SECTION_TIMEOUT_MS))) {
        return fail("The shipping method section never opened after saving the guest address", base);
      }
      const shippingAddress = visibleText(await page.queryAll(selectors.shippingAddressSummary));
      Object.assign(base, { shippingAddress });
      if (!shippingAddress.includes(guest.postalCode)) {
        return fail(`The saved shipping address does not show the guest postal code ${guest.postalCode}`, base);
      }

      if (!(await page.waitFor(selectors.shippingMethodNext, "enabled", PRESELECTED_TIMEOUT_MS))) {
        await safeClick(page, selectors.shippingMethodOption);
        if (!(await page.waitFor(selectors.shippingMethodNext, "enabled", SECTION_TIMEOUT_MS))) {
          return fail("The shipping method could not be confirmed", base);
        }
      }
      await safeClick(page, selectors.shippingMethodNext);

      if (!(await page.waitFor(selectors.paymentMethodOption, "visible", SECTION_TIMEOUT_MS))) {
        return fail("The payment screen never showed any payment method", base);
      }
      const paymentMethods = visibleTexts(await page.queryAll(selectors.paymentMethodLabel));
      const lineItems = visibleTexts(await page.queryAll(selectors.checkoutItemName));
      Object.assign(base, { paymentMethods, lineItems });
      if (!lineItems.some((name) => sameProductName(name, pdp.title))) {
        return fail(`The picked product "${pdp.title}" is not in the order summary`, base);
      }

      const subtotalText = visibleText(await page.queryAll(selectors.checkoutSubtotal));
      const subtotalMxn = parseMxn(subtotalText);
      const metadata = { ...base, subtotalMxn };
      if (subtotalMxn === null) {
        return fail(`The checkout subtotal is missing or not a positive MXN amount (saw "${subtotalText}")`, metadata);
      }
      if (toCents(subtotalMxn) !== toCents(pdp.priceMxn)) {
        return fail(`The checkout subtotal $${subtotalMxn} does not match the product page price $${pdp.priceMxn}`, metadata);
      }
      return { status: "ok", metadata };
    },
  };
}

function fail(message: string, metadata: Record<string, unknown>): StepOutcome {
  return { status: "fail", error: { message }, metadata: { ...metadata } };
}

const visibleTexts = (matches: { text: string; visible: boolean }[]) =>
  matches.filter((m) => m.visible).map((m) => m.text.replace(/\s+/g, " ").trim());

const visibleText = (matches: { text: string; visible: boolean }[]) => visibleTexts(matches)[0] ?? "";
