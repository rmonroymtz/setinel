import { OrderPlacementBlockedError } from "../journey/errors.ts";
import type { JourneyStep, StepOutcome } from "../journey/run-journey.ts";
import type { Page } from "../ports/browser.ts";
import type { ArtifactStore } from "../ports/artifact-store.ts";

type InstrumentedPage = Pick<Page, "takeDiagnostics" | "takeBlockedOrderRequests" | "screenshot">;

/**
 * Wraps a step so that every step result carries the console errors and failed
 * requests seen while it ran, plus a screenshot of the page as the step left
 * it, so every step of a run can be inspected afterwards.
 *
 * Console errors are metadata only: a busy storefront always logs some, and
 * failing on them would make the monitor cry wolf. Failed same-site requests
 * degrade an otherwise ok step.
 *
 * If the network guard aborted an order-placing request while the step ran, the
 * step throws OrderPlacementBlockedError (a run error) whatever its own outcome:
 * the monitor tried to buy, and that must never pass as ok, degraded or a site failure.
 */
export function instrumentStep<Ctx>(
  step: JourneyStep<Ctx>,
  deps: { page: InstrumentedPage; store: ArtifactStore },
): JourneyStep<Ctx> {
  const { page, store } = deps;
  return {
    name: step.name,
    async run(context) {
      // Drop anything left from the previous step.
      page.takeDiagnostics();
      page.takeBlockedOrderRequests();
      let outcome: StepOutcome;
      try {
        outcome = (await step.run(context)) ?? { status: "ok" };
      } catch (thrown) {
        await screenshot(page, store, step.name);
        throw blockedOrderError(page) ?? thrown;
      }
      const blocked = blockedOrderError(page);
      if (blocked) {
        await screenshot(page, store, step.name);
        throw blocked;
      }

      const diagnostics = page.takeDiagnostics();
      const evidence = [...(outcome.evidence ?? [])];
      const shot = await screenshot(page, store, step.name);
      if (shot) evidence.push(shot);

      const hasDiagnostics =
        diagnostics.consoleErrors.length > 0 ||
        diagnostics.failedRequests.length > 0 ||
        diagnostics.thirdPartyFailures > 0;
      const degrade = outcome.status === "ok" && diagnostics.failedRequests.length > 0;

      return {
        ...outcome,
        ...(degrade && {
          status: "degraded" as const,
          error: { message: `${diagnostics.failedRequests.length} same-site request(s) failed during this step` },
        }),
        evidence,
        ...((hasDiagnostics || outcome.metadata) && {
          metadata: { ...outcome.metadata, ...(hasDiagnostics && { diagnostics }) },
        }),
      };
    },
  };
}

function blockedOrderError(page: InstrumentedPage): OrderPlacementBlockedError | undefined {
  const blocked = page.takeBlockedOrderRequests();
  return blocked.length > 0 ? new OrderPlacementBlockedError(blocked) : undefined;
}

// Evidence is best effort: a closed page must not hide the real failure.
async function screenshot(page: InstrumentedPage, store: ArtifactStore, stepName: string): Promise<string | undefined> {
  try {
    const slug = stepName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return await store.writeBinary(`screenshots/${slug}.png`, await page.screenshot());
  } catch {
    return undefined;
  }
}
