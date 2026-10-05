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
  /**
   * Per-step budget. A step that does not settle in time becomes a `site`
   * failure: a page that hangs for a browser we could drive is a site problem,
   * while "could not see the site" is reported explicitly by the step itself
   * (UnobservableError). Without a value, steps are not time-limited.
   */
  stepTimeoutMs?: number;
  /** Schedules `fn` after `ms` and returns a canceller; injected so tests never wait. */
  setTimer?: (fn: () => void, ms: number) => () => void;
}

const defaultSetTimer = (fn: () => void, ms: number) => {
  const id = setTimeout(fn, ms);
  return () => clearTimeout(id);
};

export async function runJourney<Ctx>(input: RunJourneyInput<Ctx>): Promise<JourneyResult> {
  const { steps, context, now, stepTimeoutMs, setTimer = defaultSetTimer } = input;
  const limit = stepTimeoutMs === undefined ? undefined : { ms: stepTimeoutMs, setTimer };
  const startedAt = now();
  const results: StepResult[] = [];
  let failure: JourneyResult["failure"];

  for (const step of steps) {
    if (failure) {
      results.push({ name: step.name, status: "skipped", startedAt: now(), durationMs: 0, evidence: [] });
      continue;
    }

    const stepStart = now();
    const result = await executeStep(step, context, stepStart, now, limit);
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
  limit: { ms: number; setTimer: NonNullable<RunJourneyInput<Ctx>["setTimer"]> } | undefined,
): Promise<StepResult> {
  try {
    const outcome = (await withTimeout(step, step.run(context), limit)) ?? { status: "ok" };
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

function withTimeout<Ctx, T>(
  step: JourneyStep<Ctx>,
  work: Promise<T>,
  limit: { ms: number; setTimer: NonNullable<RunJourneyInput<Ctx>["setTimer"]> } | undefined,
): Promise<T> {
  if (!limit) return work;
  let cancel = () => {};
  const timeout = new Promise<never>((_, reject) => {
    cancel = limit.setTimer(
      () => reject(new Error(`Step "${step.name}" timed out after ${limit.ms}ms`)),
      limit.ms,
    );
  });
  // The abandoned step may reject later; swallow it so it is not an unhandled rejection.
  work.catch(() => {});
  return Promise.race([work, timeout]).finally(cancel);
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
  try {
    return { message: String(thrown) };
  } catch {
    // String() throws for values such as null-prototype objects.
    return { message: "Step threw a value that could not be described" };
  }
}
