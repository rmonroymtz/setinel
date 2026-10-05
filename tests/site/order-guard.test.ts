import { describe, expect, it } from "vitest";
import { isOrderPlacingRequest, isOrderPlacingSelector, isOrderPlacingText, mayPlaceOrder, orderPlacingReason } from "../../src/site/order-guard.ts";
import { orderPlacingDenylist, selectors } from "../../src/site/selectors.ts";

describe("order-placing guard", () => {
  it("refuses every denylisted selector, alone or nested in a longer one", () => {
    for (const denied of orderPlacingDenylist.selectors) {
      expect(isOrderPlacingSelector(denied)).toBe(true);
      expect(isOrderPlacingSelector(`main ${denied} span`)).toBe(true);
    }
  });

  it("refuses selectors that name order placing or payment, whatever their exact shape", () => {
    expect(isOrderPlacingSelector('button[class*="placeOrderButton-"]')).toBe(true);
    expect(isOrderPlacingSelector('label[for="paymentMethod--stripe_payments"]')).toBe(true);
    expect(isOrderPlacingSelector('role=button[name="Finalizar compra"i]')).toBe(true);
    expect(isOrderPlacingSelector("text=Pagar")).toBe(true);
  });

  it("allows the controls the checkout step needs to reach the payment screen", () => {
    for (const key of ["addressSuggestion", "saveAddress", "shippingMethodOption", "shippingMethodNext"] as const) {
      expect(isOrderPlacingSelector(selectors[key])).toBe(false);
    }
  });

  it("refuses order-placing and payment wording, ignoring case and accents", () => {
    for (const text of ["Finalizar compra", "REALIZAR PEDIDO", "Place order", "Confirmar compra", "Pagar ahora", "PayPal", "Comprar ahora"]) {
      expect(isOrderPlacingText(text)).toBe(true);
    }
  });

  it("allows ordinary checkout wording and addresses", () => {
    for (const text of ["Guardar", "Siguiente", "Avenida Paseo de la Reforma 222 Juárez, Ciudad de México", ""]) {
      expect(isOrderPlacingText(text)).toBe(false);
    }
  });

});

const SITE = "https://chupaprecios.com.mx";
const CART = "Xk3pQ9rT2vYb8LmN4wZs6HjD1cFgA7eU";
const post = (path: string, body: string | null = "{}") => ({ method: "POST", url: `${SITE}${path}`, body });
const gql = (operation: string, query: string) => post("/graphql", JSON.stringify({ operationName: operation, query }));

describe("order-placing request guard", () => {
  it("refuses the GraphQL mutations the storefront uses to place an order or set a payment", () => {
    // Root fields as they appear in the live storefront bundles (2026-10-05).
    const mutations = [
      ["placeOrder", "mutation placeOrder($cartId: String!) { placeOrder(input: { cart_id: $cartId }) { order { order_number } } }"],
      ["setSelectedPaymentMethod", "mutation setSelectedPaymentMethod($cartId: String!) { setPaymentMethodOnCart(input: { cart_id: $cartId, payment_method: { code: \"braintree\" } }) { cart { id } } }"],
      ["placeOrderMercadoPago", "mutation placeOrderMercadoPago($cartId: String!) { processMercadoPagoPaymentCallback(input: { cart_id: $cartId }) { success } }"],
      ["CreateMercadoPagoCheckoutProPreference", "mutation CreateMercadoPagoCheckoutProPreference($cartId: String!) { createMercadoPagoCheckoutProPreference(input: { cart_id: $cartId }) { preference_id } }"],
      ["createPaymentIntent", "mutation createPaymentIntent($cartId: String!) { createPaymentIntent(input: { guest_cart_id: $cartId }) { intent_client_secret } }"],
      ["createPaypalExpressToken", "mutation createPaypalExpressToken($cartId: String!) { createPaypalExpressToken(input: { cart_id: $cartId, code: \"paypal_express\" }) { token } }"],
      ["AddStripePaymentMethod", "mutation AddStripePaymentMethod($t: String!) { addStripePaymentMethod(input: { cc_stripejs_token: $t }) { id } }"],
    ] as const;
    for (const [operation, query] of mutations) {
      expect(orderPlacingReason(gql(operation, query)), operation).not.toBeNull();
    }
  });

  it("refuses a mutation sent in the URL of a GraphQL GET", () => {
    const query = encodeURIComponent("mutation placeOrder { placeOrder(input: { cart_id: \"x\" }) { order { order_number } } }");
    expect(isOrderPlacingRequest({ method: "GET", url: `${SITE}/graphql?query=${query}`, body: null })).toBe(true);
  });

  it("lets through every GraphQL request the journey made on the live site", () => {
    // Observed walking the guest journey to the payment screen (2026-10-05).
    for (const operation of ["createCart", "AddProductToCart", "generateMagentoSku", "setGuestEmailOnCheckout", "SetShippingAddress", "SetShippingAddressForEstimate", "SetShippingMethod"]) {
      expect(isOrderPlacingRequest(gql(operation, `mutation ${operation}($cartId: String!) { ${operation}(input: { cart_id: $cartId }) { cart { id } } }`)), operation).toBe(false);
    }
    for (const operation of ["getPaymentMethods", "getCheckoutDetails", "getPriceSummary", "checkEmail"]) {
      const query = encodeURIComponent(`query ${operation}($cartId: String!) { cart(cart_id: $cartId) { id } }`);
      expect(isOrderPlacingRequest({ method: "GET", url: `${SITE}/graphql?query=${query}&operationName=${operation}`, body: null }), operation).toBe(false);
    }
    expect(isOrderPlacingRequest(post("/graphql", null))).toBe(false);
  });

  it("refuses the Magento REST endpoints that set the payment or place the order, with or without a store code", () => {
    for (const path of [
      `/rest/V1/guest-carts/${CART}/payment-information`,
      "/rest/V1/carts/mine/payment-information",
      `/rest/default/V1/guest-carts/${CART}/payment-information`,
      `/rest/V1/guest-carts/${CART}/set-payment-information`,
      `/rest/V1/guest-carts/${CART}/selected-payment-method`,
      `/rest/V1/guest-carts/${CART}/order`,
      "/rest/V1/carts/mine/order",
      `/rest/V1/amasty_checkout/guest-carts/${CART}/payment-information`,
      "/checkout/place-order",
    ]) {
      expect(isOrderPlacingRequest(post(path)), path).toBe(true);
      expect(isOrderPlacingRequest({ method: "PUT", url: `${SITE}${path}`, body: "{}" }), path).toBe(true);
    }
  });

  it("refuses creating a PayPal order", () => {
    expect(isOrderPlacingRequest({ method: "POST", url: "https://www.paypal.com/v2/checkout/orders", body: "{}" })).toBe(true);
  });

  it("lets through the REST and API requests a checkout needs to reach the payment screen", () => {
    for (const path of [
      `/rest/V1/guest-carts/${CART}/shipping-information`,
      `/rest/V1/guest-carts/${CART}/estimate-shipping-methods`,
      `/rest/V1/guest-carts/${CART}/totals-information`,
      "/rest/V1/customers/isEmailAvailable",
      "/api/v1/search/",
      "/api/v1/product/",
      "/api/v1/product/variants/",
    ]) {
      expect(isOrderPlacingRequest(post(path)), path).toBe(false);
    }
    // PayPal's SDK authenticates on its own when the payment screen loads.
    expect(isOrderPlacingRequest({ method: "POST", url: "https://www.paypal.com/v1/oauth2/token", body: "grant_type=client_credentials" })).toBe(false);
  });

  it("only refuses REST calls that write: reading payment methods or an order is fine", () => {
    expect(isOrderPlacingRequest({ method: "GET", url: `${SITE}/rest/V1/guest-carts/${CART}/selected-payment-method`, body: null })).toBe(false);
  });

  it("names what it refused", () => {
    expect(orderPlacingReason(gql("placeOrder", "mutation placeOrder { placeOrder(input: {}) { order { order_number } } }"))).toBe("GraphQL placeOrder");
    expect(orderPlacingReason(post(`/rest/V1/guest-carts/${CART}/payment-information`))).toBe("REST payment-information");
    expect(orderPlacingReason(post("/api/v1/search/"))).toBeNull();
  });

  it("inspects only GraphQL and order-placing URLs, so routing leaves the rest of the traffic alone", () => {
    expect(mayPlaceOrder(`${SITE}/graphql?query=x`)).toBe(true);
    expect(mayPlaceOrder(`${SITE}/rest/V1/guest-carts/${CART}/payment-information`)).toBe(true);
    expect(mayPlaceOrder("https://www.paypal.com/v2/checkout/orders")).toBe(true);
    expect(mayPlaceOrder(`${SITE}/static/js/client.js`)).toBe(false);
    expect(mayPlaceOrder(`${SITE}/api/v1/search/`)).toBe(false);
  });
});
