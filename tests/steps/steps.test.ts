import { describe, expect, it } from "vitest";
import { homeStep } from "../../src/steps/home.ts";
import { searchStep } from "../../src/steps/search.ts";
import { pickProductStep } from "../../src/steps/pick-product.ts";
import { pdpStep } from "../../src/steps/pdp.ts";
import { addToCartStep } from "../../src/steps/add-to-cart.ts";
import { checkoutStep } from "../../src/steps/checkout.ts";
import { DEFAULT_GUEST_PROFILE } from "../../src/site/guest-profile.ts";
import { orderPlacingDenylist } from "../../src/site/selectors.ts";
import { buildSteps } from "../../src/steps/index.ts";
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
  /** Elements per URL, then per selector, that appear once the selector is clicked. */
  afterClick?: Record<string, Record<string, Record<string, ElementInfo[]>>>;
  /** Elements per URL, then per selector, that appear once text is typed into the selector. */
  afterType?: Record<string, Record<string, Record<string, ElementInfo[]>>>;
};

function fakePage(
  site: Site,
): Page & { visited: string[]; clicked: string[]; filled: Record<string, string>; typed: Record<string, string> } {
  let current = "";
  const visited: string[] = [];
  const clicked: string[] = [];
  const filled: Record<string, string> = {};
  const typed: Record<string, string> = {};
  const query = async (selector: string) => site.elements?.[current]?.[selector] ?? [];
  const reveal = (patches: Record<string, Record<string, ElementInfo[]>> = {}) => {
    for (const [url, patch] of Object.entries(patches)) {
      site.elements = { ...site.elements, [url]: { ...site.elements?.[url], ...patch } };
    }
  };
  const editable = async (selector: string) => {
    if (!(await query(selector)).some((m) => m.visible && !m.disabled)) throw new Error(`locator.fill: Timeout waiting for ${selector}`);
  };
  return {
    visited,
    clicked,
    filled,
    typed,
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
    async click(selector) {
      if (!(await query(selector)).some((m) => m.visible && !m.disabled)) throw new Error(`locator.click: Timeout waiting for ${selector}`);
      clicked.push(selector);
      reveal(site.afterClick?.[selector]);
    },
    async fill(selector, value) {
      await editable(selector);
      filled[selector] = value;
    },
    async type(selector, text) {
      await editable(selector);
      typed[selector] = text;
      reveal(site.afterType?.[selector]);
    },
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
    expect(page.clicked).toEqual([]);
    expect(context.pdp).toEqual({ title: "Licuadora Ninja", priceMxn: 2341.76 });
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

describe("add-to-cart step", () => {
  const pdpUrl = "https://s.test/p1.html";
  const cartUrl = "https://s.test/cart";
  const picked = { name: "P1", url: pdpUrl, available: true };
  const title = "Licuadora Ninja Professional";
  const cartPage = (over: Record<string, ElementInfo[]> = {}): Record<string, ElementInfo[]> => ({
    [selectors.cartItem]: [el({ text: `${title} Cantidad - + Eliminar $ 2 , 341 . 76` })],
    [selectors.cartItemName]: [el({ text: title })],
    [selectors.cartSubtotal]: [el({ text: "Subtotal $2,341.76" })],
    ...over,
  });
  const site = (cart: Record<string, ElementInfo[]>, added = true): Site => ({
    elements: { [pdpUrl]: { [selectors.addToCart]: [el({ text: "Agregar al carrito" })] }, [cartUrl]: cart },
    afterClick: added ? { [selectors.addToCart]: { [pdpUrl]: { [selectors.cartCounter]: [el({ text: "1" })] } } } : {},
  });
  const run = async (s: Site) => {
    const page = fakePage(s);
    await page.goto(pdpUrl); // the pdp step leaves the browser on the product page
    const context = ctx(page, { product: picked, pdp: { title, priceMxn: 2341.76 } });
    const r = await runJourney({ steps: [addToCartStep], context, now: clock() });
    return { r, page };
  };

  it("clicks add to cart, opens the cart and matches the line item and subtotal with the PDP", async () => {
    const { r, page } = await run(site(cartPage()));

    expect(page.clicked).toEqual([selectors.addToCart]);
    expect(page.visited.at(-1)).toBe(cartUrl);
    expect(r.steps[0]).toMatchObject({
      status: "ok",
      metadata: { cartUrl, title, pdpPriceMxn: 2341.76, subtotalMxn: 2341.76, lineItems: [title] },
    });
  });

  it("matches the product name ignoring case and spacing", async () => {
    const { r } = await run(site(cartPage({ [selectors.cartItemName]: [el({ text: "  licuadora  NINJA professional " })] })));
    expect(r.steps[0]?.status).toBe("ok");
  });

  it("fails when the subtotal differs from the PDP price", async () => {
    const { r } = await run(site(cartPage({ [selectors.cartSubtotal]: [el({ text: "Subtotal $2,399.00" })] })));
    expect(r.steps[0]).toMatchObject({ status: "fail", failureKind: "site", metadata: { subtotalMxn: 2399 } });
    expect(r.steps[0]?.error?.message).toMatch(/subtotal/i);
  });

  it("fails when the cart shows no subtotal", async () => {
    const { r } = await run(site(cartPage({ [selectors.cartSubtotal]: [] })));
    expect(r.steps[0]).toMatchObject({ status: "fail", failureKind: "site" });
    expect(r.steps[0]?.error?.message).toMatch(/subtotal/i);
  });

  it("fails when the picked product is not among the cart lines", async () => {
    const { r } = await run(site(cartPage({ [selectors.cartItemName]: [el({ text: "Otro producto" })] })));
    expect(r.steps[0]).toMatchObject({ status: "fail", failureKind: "site" });
    expect(r.steps[0]?.error?.message).toMatch(/not in the cart/);
  });

  it("fails when the cart page has no line items", async () => {
    const { r } = await run(site(cartPage({ [selectors.cartItem]: [], [selectors.cartItemName]: [] })));
    expect(r.steps[0]).toMatchObject({ status: "fail", failureKind: "site" });
    expect(r.steps[0]?.error?.message).toMatch(/no line items/);
  });

  it("fails without visiting the cart when the click never reaches the cart", async () => {
    const { r, page } = await run(site(cartPage(), false));
    expect(r.steps[0]).toMatchObject({ status: "fail", failureKind: "site" });
    expect(r.steps[0]?.error?.message).toMatch(/cart counter/);
    expect(page.visited).not.toContain(cartUrl);
  });

  it("is a site failure when the add-to-cart button cannot be clicked", async () => {
    const s = site(cartPage());
    s.elements![pdpUrl] = { [selectors.addToCart]: [el({ disabled: true })] };
    const { r } = await run(s);
    expect(r.failure).toEqual({ step: "add-to-cart", kind: "site" });
  });

  it("flags a blocked cart page as unobservable", async () => {
    const s = site(cartPage());
    s.navigation = { [cartUrl]: { status: 403, url: cartUrl, title: "403 Forbidden", bodyTextLength: 50 } };
    const { r } = await run(s);
    expect(r.failure).toEqual({ step: "add-to-cart", kind: "unobservable" });
  });

  it("refuses to run without the PDP price", async () => {
    const page = fakePage(site(cartPage()));
    const r = await runJourney({ steps: [addToCartStep], context: ctx(page, { product: picked }), now: clock() });
    expect(r.steps[0]?.status).toBe("fail");
    expect(page.clicked).toEqual([]);
  });
});

describe("checkout step", () => {
  const cartUrl = "https://s.test/cart";
  const checkoutUrl = "https://s.test/checkout";
  const title = "Licuadora Ninja Professional";
  const guest = { ...DEFAULT_GUEST_PROFILE, email: "probe@s.test" };
  const s = selectors;

  /** A one-step checkout where each action reveals the next section, as the live site does. */
  const site = (over: { checkout?: Record<string, ElementInfo[]>; payment?: Record<string, ElementInfo[]> } = {}): Site => ({
    elements: {
      [checkoutUrl]: {
        [s.guestEmail]: [el()],
        [s.guestFirstName]: [el()],
        [s.guestLastName]: [el()],
        [s.guestPhone]: [el()],
        [s.addressAutocomplete]: [el()],
        ...over.checkout,
      },
    },
    afterType: {
      [s.addressAutocomplete]: { [checkoutUrl]: { [s.addressSuggestion]: [el({ text: "Avenida Paseo de la Reforma 222 Juárez, Ciudad de México" })] } },
    },
    afterClick: {
      [s.addressSuggestion]: { [checkoutUrl]: { [s.addressStreet]: [el()], [s.addressReferences]: [el()], [s.saveAddress]: [el({ text: "Guardar" })] } },
      [s.saveAddress]: {
        [checkoutUrl]: {
          [s.shippingMethodOpen]: [el()],
          [s.shippingMethodOption]: [el()],
          [s.shippingMethodNext]: [el({ text: "Siguiente" })],
          [s.shippingAddressSummary]: [el({ text: "Dirección de envío Av. P.º de la Reforma 222, Juárez Ciudad de México, Cuauhtémoc 06600" })],
        },
      },
      [s.shippingMethodNext]: {
        [checkoutUrl]: {
          [s.paymentMethodOption]: [el(), el()],
          [s.paymentMethodLabel]: [el({ text: "Tarjeta de crédito o débito" }), el({ text: "OXXO" })],
          [s.checkoutItemName]: [el({ text: title })],
          [s.checkoutSubtotal]: [el({ text: "Subtotal $2,341.76" })],
          ...over.payment,
        },
      },
    },
  });
  const run = async (st: Site, over: Partial<JourneyContext> = {}) => {
    const page = fakePage(st);
    await page.goto(cartUrl); // the add-to-cart step leaves the browser on the cart
    const context = ctx(page, { product: { name: "P1", url: "https://s.test/p1.html", available: true }, pdp: { title, priceMxn: 2341.76 }, ...over });
    const r = await runJourney({ steps: [checkoutStep(guest)], context, now: clock() });
    return { r, page };
  };

  it("checks out as a guest up to the payment screen and stops there", async () => {
    const { r, page } = await run(site());

    expect(page.visited.at(-1)).toBe(checkoutUrl);
    expect(page.filled).toMatchObject({
      [s.guestEmail]: "probe@s.test",
      [s.guestFirstName]: guest.firstName,
      [s.guestLastName]: guest.lastName,
      [s.guestPhone]: guest.phone,
      [s.addressReferences]: guest.references,
    });
    expect(page.typed[s.addressAutocomplete]).toBe(guest.address);
    expect(page.clicked).toEqual([s.addressSuggestion, s.saveAddress, s.shippingMethodNext]);
    expect(r.steps[0]).toMatchObject({
      status: "ok",
      metadata: {
        checkoutUrl,
        title,
        pdpPriceMxn: 2341.76,
        subtotalMxn: 2341.76,
        lineItems: [title],
        paymentMethods: ["Tarjeta de crédito o débito", "OXXO"],
      },
    });
  });

  it("never clicks anything on the order-placing denylist", async () => {
    const { page } = await run(site());
    for (const clicked of page.clicked) {
      for (const denied of orderPlacingDenylist.selectors) expect(clicked).not.toContain(denied);
    }
  });

  it("is a site failure when checkout offers no guest form", async () => {
    const { r } = await run(site({ checkout: { [s.guestEmail]: [] } }));
    expect(r.steps[0]).toMatchObject({ status: "fail", failureKind: "site" });
    expect(r.steps[0]?.error?.message).toMatch(/guest/i);
  });

  it("fails when the address search shows no suggestions", async () => {
    const st = site();
    st.afterType = {};
    const { r } = await run(st);
    expect(r.steps[0]).toMatchObject({ status: "fail", failureKind: "site" });
    expect(r.steps[0]?.error?.message).toMatch(/address suggestion/i);
  });

  it("fails when the shipping method section never opens after saving the address", async () => {
    const st = site();
    delete st.afterClick![s.saveAddress];
    const { r } = await run(st);
    expect(r.steps[0]).toMatchObject({ status: "fail", failureKind: "site" });
    expect(r.steps[0]?.error?.message).toMatch(/shipping method/i);
  });

  it("fails when the saved address does not carry the guest postal code", async () => {
    const st = site();
    st.afterClick![s.saveAddress]![checkoutUrl]![s.shippingAddressSummary] = [el({ text: "Dirección de envío Aguascalientes 20000" })];
    const { r } = await run(st);
    expect(r.steps[0]).toMatchObject({ status: "fail", failureKind: "site" });
    expect(r.steps[0]?.error?.message).toMatch(/postal code/i);
  });

  it("fails when the payment screen never shows payment methods", async () => {
    const { r } = await run(site({ payment: { [s.paymentMethodOption]: [] } }));
    expect(r.steps[0]).toMatchObject({ status: "fail", failureKind: "site" });
    expect(r.steps[0]?.error?.message).toMatch(/payment/i);
  });

  it("fails when the order summary does not list the product", async () => {
    const { r } = await run(site({ payment: { [s.checkoutItemName]: [el({ text: "Otro producto" })] } }));
    expect(r.steps[0]).toMatchObject({ status: "fail", failureKind: "site" });
    expect(r.steps[0]?.error?.message).toMatch(/not in the order summary/);
  });

  it("fails when the checkout subtotal differs from the PDP price", async () => {
    const { r } = await run(site({ payment: { [s.checkoutSubtotal]: [el({ text: "Subtotal $2,399.00" })] } }));
    expect(r.steps[0]).toMatchObject({ status: "fail", failureKind: "site", metadata: { subtotalMxn: 2399 } });
    expect(r.steps[0]?.error?.message).toMatch(/subtotal/i);
  });

  it("flags a blocked checkout page as unobservable", async () => {
    const st = site();
    st.navigation = { [checkoutUrl]: { status: 403, url: checkoutUrl, title: "403 Forbidden", bodyTextLength: 50 } };
    const { r } = await run(st);
    expect(r.failure).toEqual({ step: "checkout", kind: "unobservable" });
  });

  it("refuses to run without the PDP price", async () => {
    const { r, page } = await run(site(), { pdp: undefined });
    expect(r.steps[0]?.status).toBe("fail");
    expect(page.visited).not.toContain(checkoutUrl);
  });
});

describe("buildSteps", () => {
  it("checks out right after adding to cart", () => {
    const store = { writeJson: async () => "", writeBinary: async () => "" };
    const names = buildSteps({ page: fakePage({}), store: store as never }).map((s) => s.name);
    expect(names).toEqual(["home", "search", "pick-product", "pdp", "add-to-cart", "checkout"]);
  });
});
