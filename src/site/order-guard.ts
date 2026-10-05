import { orderPlacingDenylist } from "./selectors.ts";

/**
 * The journey must never place an order or start a payment. These predicates
 * back two independent guards: `safeClick` refuses order-placing clicks, and the
 * Playwright adapter aborts order-placing GraphQL and REST requests.
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

/** The parts of an outgoing browser request the network guard looks at. */
export interface OutgoingRequest {
  method: string;
  url: string;
  body: string | null;
}

/*
 * GraphQL root fields that place an order, set a payment method or open a
 * payment with a provider. Confirmed in the live storefront bundles on
 * 2026-10-05: Kueski also goes through `placeOrder`, Mercado Pago through
 * `createMercadoPagoCheckoutProPreference` and `processMercadoPagoPaymentCallback`.
 * `setPaymentMethodAndPlaceOrder` and `createBraintreeClientToken` are inferred
 * from Magento core and kept for safety. Matched as fields, so the operation name
 * (`setSelectedPaymentMethod` -> `setPaymentMethodOnCart`) does not matter.
 */
const ORDER_PLACING_FIELDS = [
  "placeOrder",
  "setPaymentMethodOnCart",
  "setPaymentMethodAndPlaceOrder",
  "processMercadoPagoPaymentCallback",
  "createMercadoPagoCheckoutProPreference",
  "createPaymentIntent",
  "createVaultPaymentIntent",
  "createPaypalExpressToken",
  "createBraintreeClientToken",
  "addStripePaymentMethod",
  "tokenizeCreditCard",
  "createVenmoPaymentContext",
  "createVenmoQRCodePaymentContext",
];
const ORDER_PLACING_MUTATION = new RegExp(`\\bmutation\\b[\\s\\S]*?\\b(${ORDER_PLACING_FIELDS.join("|")})\\b`, "i");
const GRAPHQL_PATH = /\/graphql\b/i;

/*
 * Write endpoints, by URL path, that set the payment or place the order.
 * Confirmed in the storefront bundles: `POST /rest/V1/guest-carts/<id>/payment-information`
 * (and `carts/mine`). Inferred from Magento core and Amasty: an optional store
 * code (`/rest/<store>/V1`), `set-payment-information`, `selected-payment-method`,
 * `PUT .../order`, any `place-order` path and PayPal's order creation.
 */
const ORDER_PLACING_PATHS: { name: string; path: RegExp }[] = [
  { name: "REST payment-information", path: /\/V1\/.*\/(set-)?payment-information\/?$/i },
  { name: "REST selected-payment-method", path: /\/V1\/.*\/selected-payment-method\/?$/i },
  { name: "REST cart order", path: /\/V1\/(guest-carts\/[^/]+|carts\/[^/]+)\/order\/?$/i },
  { name: "place-order", path: /place-?order/i },
  { name: "PayPal order", path: /^\/v2\/checkout\/orders\/?$/i },
];

/**
 * URL-only pre-filter for routing: true for the requests the guard must inspect
 * (GraphQL and the order-placing paths), so everything else is never intercepted.
 */
export function mayPlaceOrder(url: string | URL): boolean {
  const { pathname } = new URL(url);
  return GRAPHQL_PATH.test(pathname) || ORDER_PLACING_PATHS.some(({ path }) => path.test(pathname));
}

/** Why the request would place an order or set a payment (e.g. "GraphQL placeOrder"), or null when it would not. */
export function orderPlacingReason(request: OutgoingRequest): string | null {
  const url = new URL(request.url);
  if (GRAPHQL_PATH.test(url.pathname)) {
    // Apollo sends mutations as POST bodies, but a mutation in a GET query string is refused too.
    const field = ORDER_PLACING_MUTATION.exec(`${request.body ?? ""}\n${url.searchParams.get("query") ?? ""}`)?.[1];
    return field ? `GraphQL ${canonicalField(field)}` : null;
  }
  // Reading (GET) a cart's payment method or an order never places one.
  if (request.method.toUpperCase() === "GET") return null;
  return ORDER_PLACING_PATHS.find(({ path }) => path.test(url.pathname))?.name ?? null;
}

/** True for a request that would place an order or set a payment method. */
export function isOrderPlacingRequest(request: OutgoingRequest): boolean {
  return orderPlacingReason(request) !== null;
}

const canonicalField = (field: string) =>
  ORDER_PLACING_FIELDS.find((known) => known.toLowerCase() === field.toLowerCase()) ?? field;
