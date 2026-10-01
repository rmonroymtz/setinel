import type { JourneyStep, StepOutcome } from "../journey/run-journey.ts";
import type { Page } from "../ports/browser.ts";
import type { ArtifactStore } from "../ports/artifact-store.ts";

type InstrumentedPage = Pick<Page, "takeDiagnostics" | "screenshot">;

/**
 * Wraps a step so that every step result carries the console errors and failed
 * requests seen while it ran, plus a screenshot of the page as the step left
 * it, so every step of a run can be inspected afterwards.
 *
 * Console errors are metadata only: a busy storefront always logs some, and
 * failing on them would make the monitor cry wolf. Failed same-site requests
 * degrade an otherwise ok step.
 */
export function instrumentStep<Ctx>(
  step: JourneyStep<Ctx>,
  deps: { page: InstrumentedPage; store: ArtifactStore },
): JourneyStep<Ctx> {
  const { page, store } = deps;
  return {
    name: step.name,
    async run(context) {
      page.takeDiagnostics(); // drop anything left from the previous step
      let outcome: StepOutcome;
      try {
        outcome = (await step.run(context)) ?? { status: "ok" };
      } catch (thrown) {
        await screenshot(page, store, step.name);
        throw thrown;
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

// Evidence is best effort: a closed page must not hide the real failure.
async function screenshot(page: InstrumentedPage, store: ArtifactStore, stepName: string): Promise<string | undefined> {
  try {
    const slug = stepName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return await store.writeBinary(`screenshots/${slug}.png`, await page.screenshot());
  } catch {
    return undefined;
  }
}
