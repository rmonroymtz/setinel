import { join } from "node:path";
import { DiskArtifactStore } from "../adapters/disk-artifact-store.ts";
import { PlaywrightBrowser } from "../adapters/playwright-browser.ts";
import { generateSeed } from "../catalog/seed.ts";
import { runJourney } from "../journey/run-journey.ts";
import { buildReport, REPORT_FILENAME } from "../report/build-report.ts";
import { buildSteps } from "../steps/index.ts";
import type { JourneyContext } from "../steps/context.ts";
import { parseCliArgs, USAGE, UsageError } from "./args.ts";
import { exitCodeFor, formatSummary } from "./summary.ts";

const STEP_TIMEOUT_MS = 90_000;
const TRACE_FILENAME = "trace.zip";

/** Returns the process exit code. */
export async function main(argv: string[], env: Record<string, string | undefined>): Promise<number> {
  let options;
  try {
    options = parseCliArgs(argv, env);
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    console.error(`sentinel: ${error.message}\n\n${USAGE}`);
    return 2;
  }
  if (options.help) {
    console.log(USAGE);
    return 0;
  }

  const seed = options.seed ?? generateSeed();
  const runId = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const outDir = options.outDir ?? join("runs", runId);
  const store = new DiskArtifactStore(outDir);

  let session;
  try {
    session = await new PlaywrightBrowser().open({ siteHost: new URL(options.baseUrl).hostname, headed: options.headed });
  } catch (error) {
    console.error(`sentinel: could not start the browser: ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }

  const context: JourneyContext = {
    page: session.page,
    baseUrl: options.baseUrl,
    searchTerm: options.searchTerm,
    seed,
    candidates: [],
  };
  const journey = await runJourney({
    steps: buildSteps({ page: session.page, store }),
    context,
    now: Date.now,
    stepTimeoutMs: STEP_TIMEOUT_MS,
  });

  // The trace must be closed before the report so it can be listed as evidence.
  const extraEvidence: string[] = [];
  try {
    const { trace } = await session.close();
    extraEvidence.push(await store.writeBinary(TRACE_FILENAME, trace));
  } catch (error) {
    console.error(`sentinel: could not save the trace: ${error instanceof Error ? error.message : String(error)}`);
  }

  const report = buildReport({ runId, seed, targetUrl: options.baseUrl, journey, extraEvidence });
  const reportPath = join(outDir, await store.writeJson(REPORT_FILENAME, report));
  console.log(formatSummary(report, reportPath));
  return exitCodeFor(report.status);
}
