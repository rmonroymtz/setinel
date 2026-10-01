import { UnobservableError } from "./errors.ts";
import type { FailureKind, StepError, StepResult } from "./step-result.ts";

/** What a step may return; returning nothing means `ok`. */
export interface StepOutcome {
  status: "ok" | "fail" | "degraded";
  error?: StepError;
  evidence?: string[];
  metadata?: Record<string, unknown>;
  /** With `fail`: the site could not be observed, so it is a run error. */
  unobservable?: boolean;
}

export interface JourneyStep<Ctx> {
  name: string;
  run(context: Ctx): Promise<StepOutcome | void>;
}

export interface JourneyResult {
  startedAt: number;
  finishedAt: number;
  steps: StepResult[];
  /** First failing step, if any. Absent when nothing failed. */
  failure?: { step: string; kind: FailureKind };
}

export interface RunJourneyInput<Ctx> {
  steps: JourneyStep<Ctx>[];
  context: Ctx;
  /** Epoch milliseconds; injected so tests are deterministic. */
  now: () => number;
}

export async function runJourney<Ctx>(input: RunJourneyInput<Ctx>): Promise<JourneyResult> {
  const { steps, context, now } = input;
  const startedAt = now();
  const results: StepResult[] = [];
  let failure: JourneyResult["failure"];

  for (const step of steps) {
    if (failure) {
      results.push({ name: step.name, status: "skipped", startedAt: now(), durationMs: 0, evidence: [] });
      continue;
    }

    const stepStart = now();
    const result = await executeStep(step, context, stepStart, now);
    results.push(result);
    if (result.status === "fail") {
      failure = { step: step.name, kind: result.failureKind ?? "site" };
    }
  }

  return { startedAt, finishedAt: now(), steps: results, ...(failure && { failure }) };
}

async function executeStep<Ctx>(
  step: JourneyStep<Ctx>,
  context: Ctx,
  startedAt: number,
  now: () => number,
): Promise<StepResult> {
  try {
    const outcome = (await step.run(context)) ?? { status: "ok" };
    return build(step.name, startedAt, now, {
      status: outcome.status,
      ...(outcome.error && { error: outcome.error }),
      ...(outcome.status === "fail" && { failureKind: outcome.unobservable ? "unobservable" : "site" }),
      evidence: outcome.evidence ?? [],
      ...(outcome.metadata && { metadata: outcome.metadata }),
    });
  } catch (thrown) {
    return build(step.name, startedAt, now, {
      status: "fail",
      error: toStepError(thrown),
      failureKind: thrown instanceof UnobservableError ? "unobservable" : "site",
      evidence: [],
    });
  }
}

function build(
  name: string,
  startedAt: number,
  now: () => number,
  rest: Omit<StepResult, "name" | "startedAt" | "durationMs">,
): StepResult {
  return { name, startedAt, durationMs: now() - startedAt, ...rest };
}

function toStepError(thrown: unknown): StepError {
  if (thrown instanceof UnobservableError) {
    return { message: thrown.message, ...(thrown.detail && { detail: thrown.detail }) };
  }
  if (thrown instanceof Error) {
    return { message: thrown.message, ...(thrown.stack && { detail: thrown.stack }) };
  }
  return { message: String(thrown) };
}
