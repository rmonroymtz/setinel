import { describe, expect, it } from "vitest";
import { OrderPlacementRefusedError as RefusedFromErrors, UnobservableError } from "../../src/journey/errors.ts";
import { runJourney } from "../../src/journey/run-journey.ts";
import type { ElementInfo, Page } from "../../src/ports/browser.ts";
import { OrderPlacementRefusedError, safeClick } from "../../src/steps/safe-click.ts";

const el = (text: string): ElementInfo => ({ text, href: null, alt: null, naturalWidth: 0, disabled: false, visible: true });

function page(matches: ElementInfo[]) {
  const clicked: string[] = [];
  const p = { queryAll: async () => matches, click: async (sel: string) => void clicked.push(sel) } as unknown as Page;
  return { p, clicked };
}

describe("safeClick", () => {
  it("refuses a denylisted selector without clicking", async () => {
    const { p, clicked } = page([el("Ok")]);
    await expect(safeClick(p, '[class*="placeOrderButton-"]')).rejects.toBeInstanceOf(OrderPlacementRefusedError);
    expect(clicked).toEqual([]);
  });

  it("refuses an innocent-looking selector whose element reads like placing the order", async () => {
    const { p, clicked } = page([el("Finalizar compra")]);
    await expect(safeClick(p, '[class*="block-nextButton-"]')).rejects.toBeInstanceOf(OrderPlacementRefusedError);
    expect(clicked).toEqual([]);
  });

  it("clicks anything else", async () => {
    const { p, clicked } = page([el("Siguiente")]);
    await safeClick(p, '[class*="block-nextButton-"]');
    expect(clicked).toEqual(['[class*="block-nextButton-"]']);
  });

  it("signals a refusal as a run error (a monitor bug), not a site failure", async () => {
    const { p } = page([el("Pagar ahora")]);
    const refusal = await safeClick(p, '[class*="block-nextButton-"]').catch((e: unknown) => e);
    expect(refusal).toBeInstanceOf(UnobservableError);
    expect(refusal).toBeInstanceOf(RefusedFromErrors);
    expect((refusal as Error).name).toBe("OrderPlacementRefusedError");

    const journey = await runJourney({
      steps: [{ name: "checkout", run: () => safeClick(p, '[class*="block-nextButton-"]') }],
      context: {},
      now: () => 0,
    });
    expect(journey.failure).toEqual({ step: "checkout", kind: "unobservable" });
  });
});
