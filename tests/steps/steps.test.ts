import { describe, expect, it } from "vitest";
import { homeStep } from "../../src/steps/home.ts";
import { searchStep } from "../../src/steps/search.ts";
import { pickProductStep } from "../../src/steps/pick-product.ts";
import { pdpStep } from "../../src/steps/pdp.ts";
import { selectors } from "../../src/site/selectors.ts";
import { runJourney } from "../../src/journey/run-journey.ts";
import type { JourneyContext } from "../../src/steps/context.ts";
import type { Condition, ElementInfo, NavigationResult, Page } from "../../src/ports/browser.ts";

const el = (over: Partial<ElementInfo> = {}): ElementInfo => ({
  text: "",
  href: null,
  alt: null,
  naturalWidth: 0,
  disabled: false,
  visible: true,
  ...over,
});

type Site = {
  navigation?: Record<string, NavigationResult | Error>;
  /** Elements per URL, then per selector. */
  elements?: Record<string, Record<string, ElementInfo[]>>;
};

function fakePage(site: Site): Page & { visited: string[] } {
  let current = "";
  const visited: string[] = [];
  const query = async (selector: string) => site.elements?.[current]?.[selector] ?? [];
  return {
    visited,
    async goto(url) {
      visited.push(url);
      const nav = site.navigation?.[url] ?? { status: 200, url, title: "Chupaprecios", bodyTextLength: 5_000 };
      if (nav instanceof Error) throw nav;
      current = url;
      return nav;
    },
    async submit(_selector, text) {
      current = `search:${text}`;
    },
    queryAll: query,
    async waitFor(selector, condition: Condition) {
      const matches = await query(selector);
      if (condition === "gone") return !matches.some((m) => m.visible);
      return matches.some((m) =>
        condition === "visible" ? m.visible : condition === "enabled" ? m.visible && !m.disabled : m.visible && m.naturalWidth > 0,
      );
    },
    screenshot: async () => new Uint8Array(),
    takeDiagnostics: () => ({ consoleErrors: [], failedRequests: [], thirdPartyFailures: 0 }),
  };
}

const ctx = (page: Page, over: Partial<JourneyContext> = {}): JourneyContext => ({
  page,
  baseUrl: "https://s.test",
  searchTerm: "licuadora",
  seed: 1,
  candidates: [],
  ...over,
});

const clock = () => {
  let t = 0;
  return () => (t += 1);
};

describe("home step", () => {
  const run = (site: Site) => runJourney({ steps: [homeStep], context: ctx(fakePage(site)), now: clock() });
  const withSearchBox = { "https://s.test": { [selectors.searchInput]: [el()] } };

  it("passes on a rendered page", async () => {
    const r = await run({ elements: withSearchBox });
    expect(r.steps[0]?.status).toBe("ok");
  });

  it("flags a 403 as unobservable", async () => {
    const r = await run({ navigation: { "https://s.test": { status: 403, url: "https://s.test", title: "x", bodyTextLength: 900 } } });
    expect(r.failure).toEqual({ step: "home", kind: "unobservable" });
  });

  it("flags a network error as unobservable", async () => {
    const r = await run({ navigation: { "https://s.test": new Error("page.goto: net::ERR_NAME_NOT_RESOLVED") } });
    expect(r.failure).toEqual({ step: "home", kind: "unobservable" });
  });

  it("flags a 500 as a site failure", async () => {
    const r = await run({ navigation: { "https://s.test": { status: 500, url: "https://s.test", title: "Error", bodyTextLength: 900 } } });
    expect(r.failure).toEqual({ step: "home", kind: "site" });
  });

  it("flags a healthy-looking page without a search box as a site failure", async () => {
    const r = await run({});
    expect(r.failure).toEqual({ step: "home", kind: "site" });
    expect(r.steps[0]?.error?.message).toMatch(/search box/);
  });
});

describe("search step", () => {
  const link = (n: number) => el({ href: `https://s.test/p${n}.html`, text: `Product ${n}\n\nPROMOCIÓN\n$10`, alt: `alt ${n}` });

  it("collects deduplicated candidates from the results", async () => {
    const page = fakePage({ elements: { "search:licuadora": { [selectors.resultLink]: [link(1), link(2), link(1)] } } });
    const context = ctx(page);
    const r = await runJourney({ steps: [searchStep], context, now: clock() });

    expect(r.steps[0]).toMatchObject({ status: "ok", metadata: { term: "licuadora", resultCount: 2 } });
    expect(context.candidates).toEqual([
      { name: "Product 1", url: "https://s.test/p1.html", available: true },
      { name: "Product 2", url: "https://s.test/p2.html", available: true },
    ]);
  });

  it("fails when the search yields nothing", async () => {
    const r = await runJourney({ steps: [searchStep], context: ctx(fakePage({})), now: clock() });
    expect(r.steps[0]).toMatchObject({ status: "fail", failureKind: "site" });
  });

  it("fails when results never finish loading and keep showing shimmer placeholders", async () => {
    const page = fakePage({
      elements: { "search:licuadora": { [selectors.resultLink]: [link(1)], [selectors.loadingPlaceholder]: [el()] } },
    });
    const context = ctx(page);
    const r = await runJourney({ steps: [searchStep], context, now: clock() });
    expect(r.steps[0]).toMatchObject({ status: "fail", failureKind: "site" });
    expect(r.steps[0]?.error?.message).toMatch(/still loading/);
    expect(context.candidates).toEqual([]);
  });
});

describe("pick-product step", () => {
  const candidates = [1, 2, 3, 4, 5].map((n) => ({ name: `P${n}`, url: `https://s.test/p${n}.html`, available: true }));

  it("picks deterministically for a seed and records seed and product", async () => {
    const pick = async (seed: number) => {
      const context = ctx(fakePage({}), { seed, candidates: structuredClone(candidates) });
      const r = await runJourney({ steps: [pickProductStep], context, now: clock() });
      return { r, context };
    };
    const a = await pick(123);
    const b = await pick(123);

    expect(a.context.product).toEqual(b.context.product);
    expect(a.r.steps[0]?.metadata).toMatchObject({ seed: 123, candidateCount: 5, product: { name: a.context.product?.name, url: a.context.product?.url } });
  });

  it("fails when there are no candidates", async () => {
    const r = await runJourney({ steps: [pickProductStep], context: ctx(fakePage({})), now: clock() });
    expect(r.steps[0]).toMatchObject({ status: "fail", failureKind: "site" });
  });
});

describe("pdp step", () => {
  const product = (n: number) => ({ name: `P${n}`, url: `https://s.test/p${n}.html`, available: true });
  const healthyPdp = (): Record<string, ElementInfo[]> => ({
    [selectors.pdpTitle]: [el({ visible: false, text: "mobile" }), el({ text: "Licuadora Ninja" })],
    [selectors.pdpPrice]: [el({ text: "$2,341.76" })],
    [selectors.pdpMainImage]: [el({ naturalWidth: 853 })],
    [selectors.addToCart]: [el({ text: "Agregar al carrito" })],
    [selectors.pdpRoot]: [el({ text: "Licuadora Ninja $2,341.76" })],
  });

  it("verifies title, price, image and an enabled add-to-cart button without clicking", async () => {
    const page = fakePage({ elements: { "https://s.test/p1.html": healthyPdp() } });
    const context = ctx(page, { candidates: [product(1)], product: product(1) });
    const r = await runJourney({ steps: [pdpStep], context, now: clock() });

    expect(r.steps[0]).toMatchObject({
      status: "ok",
      metadata: { title: "Licuadora Ninja", priceMxn: 2341.76, imageWidth: 853, addToCartEnabled: true, attempts: 1 },
    });
  });

  it("reports every broken check in one failure", async () => {
    const pdp = { ...healthyPdp(), [selectors.pdpPrice]: [el({ text: "Consultar" })], [selectors.pdpMainImage]: [] };
    const page = fakePage({ elements: { "https://s.test/p1.html": pdp } });
    const context = ctx(page, { candidates: [product(1)], product: product(1) });
    const r = await runJourney({ steps: [pdpStep], context, now: clock() });

    expect(r.steps[0]).toMatchObject({ status: "fail", failureKind: "site" });
    expect(r.steps[0]?.error?.message).toMatch(/price/);
    expect(r.steps[0]?.error?.message).toMatch(/image/);
  });

  it("fails when add to cart stays disabled for no stated reason", async () => {
    const pdp = { ...healthyPdp(), [selectors.addToCart]: [el({ disabled: true })] };
    const page = fakePage({ elements: { "https://s.test/p1.html": pdp } });
    const context = ctx(page, { candidates: [product(1)], product: product(1) });
    const r = await runJourney({ steps: [pdpStep], context, now: clock() });

    expect(r.steps[0]?.status).toBe("fail");
    expect(r.steps[0]?.error?.message).toMatch(/add to cart/i);
  });

  it("moves to the next candidate when the product is sold out", async () => {
    const soldOut = { ...healthyPdp(), [selectors.addToCart]: [el({ disabled: true })], [selectors.pdpRoot]: [el({ text: "Producto agotado" })] };
    const page = fakePage({ elements: { "https://s.test/p1.html": soldOut, "https://s.test/p2.html": healthyPdp() } });
    const context = ctx(page, { candidates: [product(1), product(2)], product: product(1) });
    const r = await runJourney({ steps: [pdpStep], context, now: clock() });

    expect(r.steps[0]).toMatchObject({ status: "ok", metadata: { attempts: 2, skippedUnavailable: ["https://s.test/p1.html"] } });
    expect(context.product?.url).toBe("https://s.test/p2.html");
  });

  it("gives up after a bounded number of sold-out products", async () => {
    const soldOut = { ...healthyPdp(), [selectors.addToCart]: [el({ disabled: true })], [selectors.pdpRoot]: [el({ text: "agotado" })] };
    const urls = [1, 2, 3, 4, 5].map((n) => `https://s.test/p${n}.html`);
    const page = fakePage({ elements: Object.fromEntries(urls.map((u) => [u, soldOut])) });
    const context = ctx(page, { candidates: [1, 2, 3, 4, 5].map(product), product: product(1) });
    const r = await runJourney({ steps: [pdpStep], context, now: clock() });

    expect(page.visited.length).toBe(3);
    expect(r.steps[0]).toMatchObject({ status: "fail", failureKind: "site" });
  });

  it("flags a blocked product page as unobservable", async () => {
    const page = fakePage({
      navigation: { "https://s.test/p1.html": { status: 403, url: "", title: "403 Forbidden", bodyTextLength: 50 } },
    });
    const context = ctx(page, { candidates: [product(1)], product: product(1) });
    const r = await runJourney({ steps: [pdpStep], context, now: clock() });
    expect(r.failure).toEqual({ step: "pdp", kind: "unobservable" });
  });
});
