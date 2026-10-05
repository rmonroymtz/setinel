import { describe, expect, it } from "vitest";
import { isOrderPlacingRequest, isOrderPlacingSelector, isOrderPlacingText } from "../../src/site/order-guard.ts";
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

  it("recognises GraphQL requests that would place an order or set a payment", () => {
    expect(isOrderPlacingRequest('{"query":"mutation placeOrder($cartId: String!) { placeOrder(input: {cart_id: $cartId}) { order { number } } }"}')).toBe(true);
    expect(isOrderPlacingRequest('{"operationName":"setPaymentMethodOnCart","query":"mutation setPaymentMethodOnCart { x }"}')).toBe(true);
    expect(isOrderPlacingRequest('{"query":"mutation createPaypalExpressToken { x }"}')).toBe(true);
  });

  it("lets ordinary checkout requests through", () => {
    expect(isOrderPlacingRequest('{"operationName":"SetShippingAddress","query":"mutation SetShippingAddress { x }"}')).toBe(false);
    expect(isOrderPlacingRequest('{"operationName":"getPaymentMethods","query":"query getPaymentMethods { x }"}')).toBe(false);
    expect(isOrderPlacingRequest(null)).toBe(false);
  });
});
