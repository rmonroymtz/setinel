import { join } from "node:path";
import { DiskArtifactStore } from "../adapters/disk-artifact-store.ts";
import { PlaywrightBrowser } from "../adapters/playwright-browser.ts";
import { generateSeed } from "../catalog/seed.ts";
import { runJourney, type JourneyResult } from "../journey/run-journey.ts";
import type { ArtifactStore } from "../ports/artifact-store.ts";
import type { Browser, BrowserSession } from "../ports/browser.ts";
import { buildReport, buildRunErrorReport, REPORT_FILENAME, type FailedStage, type Report } from "../report/build-report.ts";
import { buildSteps } from "../steps/index.ts";
import type { JourneyContext } from "../steps/context.ts";
import { parseCliArgs, USAGE, UsageError, type CliOptions } from "./args.ts";
import { notifyRun, type NotifyRunOptions } from "./notify.ts";
import { exitCodeFor, formatSummary } from "./summary.ts";

const STEP_TIMEOUT_MS = 90_000;
const TRACE_FILENAME = "trace.zip";

/** Injected by tests; the defaults drive Playwright and Slack. */
export interface MainDeps {
  openBrowser?: Browser["open"];
  notify?: (report: Report, options: NotifyRunOptions) => Promise<void>;
}

interface RunFacts {
  runId: string;
  seed: number;
  targetUrl: string;
  startedAt: number;
}

/** What a run produced before its report was written. */
interface RunOutcome {
  journey?: JourneyResult;
  stages: FailedStage[];
  extraEvidence: string[];
}

/**
 * Returns the process exit code. Once the run has started it always ends with a
 * report and a notification, even when the browser cannot start or the report
 * cannot be written: the team treats a missing daily Slack message as the alert.
 */
export async function main(argv: string[], env: Record<string, string | undefined>, deps: MainDeps = {}): Promise<number> {
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

  const openBrowser = deps.openBrowser ?? ((o) => new PlaywrightBrowser().open(o));
  const notify = deps.notify ?? notifyRun;
  const startedAt = Date.now();
  const runId = new Date(startedAt).toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const facts: RunFacts = { runId, seed: options.seed ?? generateSeed(), targetUrl: options.baseUrl, startedAt };
  const outDir = options.outDir ?? join("runs", runId);
  const store = new DiskArtifactStore(outDir);

  const outcome = await walk(facts, options, store, openBrowser);
  let report = toReport(facts, outcome);
  let reportPath = join(outDir, REPORT_FILENAME);
  let saved = true;
  try {
    reportPath = join(outDir, await store.writeJson(REPORT_FILENAME, report));
  } catch (error) {
    // Notify anyway with what is known; the run could not leave its report, so it is a run error.
    saved = false;
    console.error(`sentinel: could not write the report: ${messageOf(error)}`);
    outcome.stages.push(failedStage("save-report", `Could not write ${REPORT_FILENAME}`, error));
    report = toReport(facts, outcome);
  }
  console.log(formatSummary(report, saved ? reportPath : `${reportPath} (not written)`));
  // Slack is told about every run; its failures are logged and never change the exit code.
  try {
    await notify(report, { env, evidenceDir: outDir });
  } catch (error) {
    console.error(`sentinel: Slack notification failed: ${messageOf(error)}`);
  }
  return saved ? exitCodeFor(report.status) : 2;
}

/** Walks the journey; never throws: anything that goes wrong becomes a failed stage. */
async function walk(facts: RunFacts, options: CliOptions, store: ArtifactStore, openBrowser: Browser["open"]): Promise<RunOutcome> {
  const outcome: RunOutcome = { stages: [], extraEvidence: [] };
  let session: BrowserSession;
  try {
    session = await openBrowser({ siteHost: new URL(options.baseUrl).hostname, headed: options.headed });
  } catch (error) {
    console.error(`sentinel: could not start the browser: ${messageOf(error)}`);
    outcome.stages.push(failedStage("start-browser", "Could not start the browser", error));
    return outcome;
  }

  let closed = false;
  try {
    const context: JourneyContext = {
      page: session.page,
      baseUrl: options.baseUrl,
      searchTerm: options.searchTerm,
      seed: facts.seed,
      candidates: [],
    };
    outcome.journey = await runJourney({
      steps: buildSteps({ page: session.page, store }),
      context,
      now: Date.now,
      stepTimeoutMs: STEP_TIMEOUT_MS,
    });

    // The trace must be closed before the report so it can be listed as evidence.
    closed = true;
    try {
      const { trace } = await session.close();
      outcome.extraEvidence.push(await store.writeBinary(TRACE_FILENAME, trace));
    } catch (error) {
      console.error(`sentinel: could not save the trace: ${messageOf(error)}`);
    }
  } catch (error) {
    console.error(`sentinel: the run failed: ${messageOf(error)}`);
    outcome.stages.push(failedStage("run", "The run failed before its report was built", error));
    if (!closed) await session.close().catch(() => {});
  }
  return outcome;
}

function toReport(facts: RunFacts, { journey, stages, extraEvidence }: RunOutcome): Report {
  const [first, ...rest] = stages;
  if (first) return buildRunErrorReport({ ...facts, ...(journey && { journey }), stages: [first, ...rest], extraEvidence });
  if (!journey) throw new Error("a run without failed stages always has a journey");
  return buildReport({ runId: facts.runId, seed: facts.seed, targetUrl: facts.targetUrl, journey, extraEvidence });
}

function failedStage(name: string, what: string, error: unknown): FailedStage {
  const detail = error instanceof Error ? error.stack : undefined;
  return { name, message: `${what}: ${messageOf(error)}`, ...(detail && { detail }), failedAt: Date.now() };
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  try {
    return String(error);
  } catch {
    return "an error that could not be described";
  }
}
