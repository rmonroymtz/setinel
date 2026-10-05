import { orderPlacingDenylist } from "./selectors.ts";

/**
 * The journey must never place an order or start a payment. These predicates
 * back two independent guards: `safeClick` refuses order-placing clicks, and the
 * Playwright adapter aborts order-placing GraphQL requests.
 */

const fold = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

const DENIED_TEXT = new RegExp(`\\b(${orderPlacingDenylist.texts.join("|").replace(/ /g, "\\s+")})\\b`);

export function isOrderPlacingText(text: string): boolean {
  return DENIED_TEXT.test(fold(text));
}

export function isOrderPlacingSelector(selector: string): boolean {
  const folded = fold(selector);
  return (
    orderPlacingDenylist.selectors.some((denied) => folded.includes(fold(denied))) ||
    orderPlacingDenylist.selectorKeywords.some((keyword) => folded.includes(keyword)) ||
    isOrderPlacingText(selector)
  );
}

// Magento/PWA Studio mutations that place the order, choose a payment or open a payment provider.
const ORDER_PLACING_MUTATION =
  /\bmutation\b[\s\S]*\b(placeOrder|setPaymentMethodOnCart|setPaymentMethodAndPlaceOrder|createPaypalExpressToken|createBraintreeClientToken)\b/i;

/** True for a GraphQL request body that would place an order or set a payment method. */
export function isOrderPlacingRequest(body: string | null): boolean {
  return body !== null && ORDER_PLACING_MUTATION.test(body);
}
