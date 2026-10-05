import { NoAvailableProductError, pickAvailableProduct } from "../catalog/pick-product.ts";
import type { StepOutcome, JourneyStep } from "../journey/run-journey.ts";
import { classifyAvailability } from "../site/page-sanity.ts";
import { parseMxn } from "../site/price.ts";
import { selectors } from "../site/selectors.ts";
import type { JourneyContext } from "./context.ts";
import { navigate } from "./navigate.ts";

// The listing cannot tell us about stock, so sold-out products are skipped here.
// Bounded so a catalog-wide stock problem fails the run instead of crawling it.
const MAX_ATTEMPTS = 3;
const TITLE_TIMEOUT_MS = 15_000;
const IMAGE_TIMEOUT_MS = 15_000;
// The button renders disabled while the page hydrates, then enables (~3-5s observed).
const ADD_TO_CART_TIMEOUT_MS = 20_000;

export const pdpStep: JourneyStep<JourneyContext> = {
  name: "pdp",
  async run(context): Promise<StepOutcome> {
    const skippedUnavailable: string[] = [];

    for (let attempt = 1; ; attempt++) {
      const product = context.product;
      if (!product) throw new Error("pdp step ran without a picked product");

      await navigate(context.page, product.url);
      const addToCartEnabled = await context.page.waitFor(selectors.addToCart, "enabled", ADD_TO_CART_TIMEOUT_MS);
      const pageText = (await context.page.queryAll(selectors.pdpRoot)).map((e) => e.text).join("\n");
      const availability = classifyAvailability({ addToCartEnabled, pageText });

      if (availability === "unavailable") {
        product.available = false;
        skippedUnavailable.push(product.url);
        if (attempt >= MAX_ATTEMPTS) {
          return { status: "fail", error: { message: `${attempt} products in a row were sold out`, detail: skippedUnavailable.join("\n") } };
        }
        try {
          context.product = pickAvailableProduct(context.candidates, context.seed);
        } catch (error) {
          if (error instanceof NoAvailableProductError) return { status: "fail", error: { message: error.message } };
          throw error;
        }
        continue;
      }

      return check(context, product.url, { addToCartEnabled, attempts: attempt, skippedUnavailable });
    }
  },
};

async function check(
  context: JourneyContext,
  url: string,
  base: { addToCartEnabled: boolean; attempts: number; skippedUnavailable: string[] },
): Promise<StepOutcome> {
  const { page } = context;
  const problems: string[] = [];

  await page.waitFor(selectors.pdpTitle, "visible", TITLE_TIMEOUT_MS);
  const title = (await page.queryAll(selectors.pdpTitle)).find((e) => e.visible)?.text.trim() ?? "";
  if (!title) problems.push("title missing");

  const priceText = (await page.queryAll(selectors.pdpPrice)).find((e) => e.visible)?.text ?? "";
  const priceMxn = parseMxn(priceText);
  if (priceMxn === null) problems.push(`price missing or not a positive MXN amount (saw "${priceText.trim()}")`);

  await page.waitFor(selectors.pdpMainImage, "loaded", IMAGE_TIMEOUT_MS);
  const imageWidth = (await page.queryAll(selectors.pdpMainImage)).find((e) => e.visible)?.naturalWidth ?? 0;
  if (imageWidth <= 0) problems.push("main image did not load");

  if (!base.addToCartEnabled) problems.push("add to cart button is missing or disabled");

  const metadata = { url, title, priceMxn, imageWidth, ...base };
  if (problems.length > 0 || priceMxn === null) {
    return { status: "fail", error: { message: `Product page checks failed: ${problems.join("; ")}` }, metadata };
  }
  context.pdp = { title, priceMxn };
  return { status: "ok", metadata };
}
