import { pickAvailableProduct } from "../catalog/pick-product.ts";
import type { JourneyStep } from "../journey/run-journey.ts";
import type { JourneyContext } from "./context.ts";

export const pickProductStep: JourneyStep<JourneyContext> = {
  name: "pick-product",
  async run(context) {
    const product = pickAvailableProduct(context.candidates, context.seed);
    context.product = product;
    return {
      status: "ok",
      metadata: {
        seed: context.seed,
        candidateCount: context.candidates.length,
        product: { name: product.name, url: product.url },
      },
    };
  },
};
