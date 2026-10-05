import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium } from "playwright";
import type { Browser, BrowserContext } from "playwright";
import { installOrderGuard } from "../../src/adapters/playwright-browser.ts";

/*
 * Drives a real Chromium against a fake shop that exists only inside Playwright's
 * router: every request is either aborted by the guard or fulfilled by the stub
 * route below, so nothing leaves the process.
 */
const SHOP = "http://shop.test";

describe("order guard wired into a browser context", () => {
  let browser: Browser;
  let context: BrowserContext;
  const blocked: string[] = [];
  const served: string[] = [];

  beforeAll(async () => {
    browser = await chromium.launch();
    context = await browser.newContext();
    // Registered first, so it only sees what the guard lets through.
    await context.route("**/*", (route) => {
      const url = new URL(route.request().url());
      served.push(`${route.request().method()} ${url.pathname}`);
      const html = url.pathname === "/";
      return route.fulfill({
        status: 200,
        contentType: html ? "text/html" : "application/json",
        body: html ? "<html><body>shop</body></html>" : "{}",
      });
    });
    await installOrderGuard(context, (request) => blocked.push(request));
  }, 30_000);

  afterAll(async () => {
    await browser?.close();
  });

  it("aborts order-placing requests in the page and lets the journey's own requests through", async () => {
    const page = await context.newPage();
    await page.goto(`${SHOP}/`);

    const outcome = await page.evaluate(async () => {
      const call = (path: string, body: unknown) =>
        fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then(
          (r) => r.status,
          () => "aborted",
        );
      return {
        restPlaceOrder: await call("/rest/V1/guest-carts/abc123/payment-information", { cartId: "abc123" }),
        graphqlPlaceOrder: await call("/graphql", {
          operationName: "placeOrder",
          query: "mutation placeOrder($cartId: String!) { placeOrder(input: { cart_id: $cartId }) { order { order_number } } }",
        }),
        graphqlShipping: await call("/graphql", {
          operationName: "SetShippingMethod",
          query: "mutation SetShippingMethod($cartId: String!) { setShippingMethodsOnCart(input: { cart_id: $cartId }) { cart { id } } }",
        }),
        restShipping: await call("/rest/V1/guest-carts/abc123/shipping-information", {}),
        search: await call("/api/v1/search/", {}),
      };
    });

    expect(outcome).toEqual({
      restPlaceOrder: "aborted",
      graphqlPlaceOrder: "aborted",
      graphqlShipping: 200,
      restShipping: 200,
      search: 200,
    });
    expect(blocked).toEqual([
      `POST ${SHOP}/rest/V1/guest-carts/abc123/payment-information (REST payment-information)`,
      `POST ${SHOP}/graphql (GraphQL placeOrder)`,
    ]);
    expect(served).not.toContain("POST /rest/V1/guest-carts/abc123/payment-information");
    expect(served.filter((s) => s === "POST /graphql")).toHaveLength(1);
  }, 30_000);
});
