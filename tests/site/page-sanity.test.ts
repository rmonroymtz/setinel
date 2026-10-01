import { describe, expect, it } from "vitest";
import { classifyNavigation, classifyAvailability, isNetworkError } from "../../src/site/page-sanity.ts";

const nav = (over: Partial<Parameters<typeof classifyNavigation>[0]> = {}) => ({
  status: 200,
  url: "https://s.test/",
  title: "Chupaprecios",
  bodyTextLength: 6_800,
  ...over,
});

describe("classifyNavigation", () => {
  it("accepts a rendered page", () => {
    expect(classifyNavigation(nav())).toEqual({ kind: "ok" });
  });

  it.each([401, 403, 407, 429])("treats HTTP %i as unobservable (we are blocked)", (status) => {
    expect(classifyNavigation(nav({ status }))).toMatchObject({ kind: "unobservable" });
  });

  it.each(["403 Forbidden", "Access Denied", "Just a moment...", "Attention Required! | Cloudflare"])(
    "treats an error page titled %j as unobservable even with HTTP 200",
    (title) => {
      expect(classifyNavigation(nav({ title }))).toMatchObject({ kind: "unobservable" });
    },
  );

  it("treats an empty shell as unobservable", () => {
    expect(classifyNavigation(nav({ bodyTextLength: 12 }))).toMatchObject({ kind: "unobservable" });
  });

  it.each([404, 500, 502, 503])("treats HTTP %i as a real site failure", (status) => {
    expect(classifyNavigation(nav({ status }))).toMatchObject({ kind: "site" });
  });

  it("treats status 0 (no response) as unobservable", () => {
    expect(classifyNavigation(nav({ status: 0 }))).toMatchObject({ kind: "unobservable" });
  });
});

describe("isNetworkError", () => {
  it.each(["net::ERR_NAME_NOT_RESOLVED at https://x", "page.goto: net::ERR_CONNECTION_REFUSED", "net::ERR_INTERNET_DISCONNECTED"])(
    "recognises %j",
    (message) => expect(isNetworkError(message)).toBe(true),
  );

  it("does not treat a timeout as a network error: a hung site is a site problem", () => {
    expect(isNetworkError("page.goto: Timeout 30000ms exceeded")).toBe(false);
  });
});

describe("classifyAvailability", () => {
  it("is available when add to cart is enabled", () => {
    expect(classifyAvailability({ addToCartEnabled: true, pageText: "" })).toBe("available");
  });

  it("is unavailable when add to cart is blocked and the page says sold out", () => {
    expect(classifyAvailability({ addToCartEnabled: false, pageText: "Producto agotado" })).toBe("unavailable");
    expect(classifyAvailability({ addToCartEnabled: false, pageText: "Currently unavailable." })).toBe("unavailable");
  });

  it("is broken when add to cart is blocked and nothing explains it", () => {
    expect(classifyAvailability({ addToCartEnabled: false, pageText: "Licuadora $1,200" })).toBe("broken");
  });

  it("does not trust sold-out wording when the button works", () => {
    expect(classifyAvailability({ addToCartEnabled: true, pageText: "Reseña: llegó agotado el empaque" })).toBe("available");
  });
});
