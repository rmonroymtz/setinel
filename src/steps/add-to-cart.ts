import type { JourneyStep, StepOutcome } from "../journey/run-journey.ts";
import { parseMxn } from "../site/price.ts";
import { selectors } from "../site/selectors.ts";
import type { JourneyContext } from "./context.ts";
import { navigate } from "./navigate.ts";

// The counter shows up once the add-to-cart mutation answers (~1-2s observed).
const CART_COUNTER_TIMEOUT_MS = 15_000;
// Cart lines and the price summary render after the cart query resolves.
const CART_CONTENT_TIMEOUT_MS = 15_000;

/**
 * Adds the product the pdp step checked to a guest cart, opens the cart page and
 * checks the line item and the subtotal against what the product page showed.
 * Stops at the cart: it never starts checkout.
 *
 * The subtotal must equal the PDP price to the cent. The live site shows the
 * same two-decimal amount on both pages, so no rounding tolerance is needed;
 * comparing in cents only absorbs floating-point noise.
 */
export const addToCartStep: JourneyStep<JourneyContext> = {
  name: "add-to-cart",
  async run(context): Promise<StepOutcome> {
    const { page, pdp } = context;
    if (!context.product || !pdp) throw new Error("add-to-cart step ran without a checked product page");

    await page.click(selectors.addToCart);
    if (!(await page.waitFor(selectors.cartCounter, "visible", CART_COUNTER_TIMEOUT_MS))) {
      return fail(`The cart counter never showed the item ${CART_COUNTER_TIMEOUT_MS / 1000}s after clicking add to cart`);
    }

    const cartUrl = new URL("/cart", context.baseUrl).href;
    await navigate(page, cartUrl);
    const base = { cartUrl, title: pdp.title, pdpPriceMxn: pdp.priceMxn };

    if (!(await page.waitFor(selectors.cartItem, "visible", CART_CONTENT_TIMEOUT_MS))) {
      return fail("The cart page shows no line items after adding the product", base);
    }
    const lineItems = (await page.queryAll(selectors.cartItemName)).filter((e) => e.visible).map((e) => e.text.trim());
    if (!lineItems.some((name) => sameProductName(name, pdp.title))) {
      return fail(`The picked product "${pdp.title}" is not in the cart`, { ...base, lineItems });
    }

    await page.waitFor(selectors.cartSubtotal, "visible", CART_CONTENT_TIMEOUT_MS);
    const subtotalText = (await page.queryAll(selectors.cartSubtotal)).find((e) => e.visible)?.text ?? "";
    const subtotalMxn = parseMxn(subtotalText);
    const metadata = { ...base, lineItems, subtotalMxn };
    if (subtotalMxn === null) {
      return fail(`The cart subtotal is missing or not a positive MXN amount (saw "${subtotalText.trim()}")`, metadata);
    }
    if (toCents(subtotalMxn) !== toCents(pdp.priceMxn)) {
      return fail(`The cart subtotal $${subtotalMxn} does not match the product page price $${pdp.priceMxn}`, metadata);
    }
    return { status: "ok", metadata };
  },
};

function fail(message: string, metadata?: Record<string, unknown>): StepOutcome {
  return { status: "fail", error: { message }, ...(metadata && { metadata }) };
}

const toCents = (mxn: number) => Math.round(mxn * 100);

const normalizeName = (name: string) => name.normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();

/** Cart and PDP render the same product name; compare it without case and spacing differences. */
function sameProductName(a: string, b: string): boolean {
  const left = normalizeName(a);
  return left !== "" && left === normalizeName(b);
}
