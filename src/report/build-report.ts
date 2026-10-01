import type { JourneyResult } from "../journey/run-journey.ts";
import type { FailureKind, StepError, StepResult, StepStatus } from "../journey/step-result.ts";

export const REPORT_FILENAME = "reporte.json";
export const REPORT_SCHEMA_VERSION = 1;

/** `run_error` means the site could not be observed; it is not a site failure. */
export type OverallStatus = "ok" | "degraded" | "fail" | "run_error";

export interface ReportStep {
  name: string;
  status: StepStatus;
  startedAt: string;
  durationMs: number;
  error?: StepError;
  failureKind?: FailureKind;
  evidence: string[];
  metadata?: Record<string, unknown>;
}

export interface Report {
  schemaVersion: number;
  runId: string;
  startedAt: string;
  finishedAt: string;
  seed: number;
  targetUrl: string;
  status: OverallStatus;
  failure?: { step: string; kind: FailureKind };
  steps: ReportStep[];
  evidence: string[];
}

export interface BuildReportInput {
  runId: string;
  seed: number;
  targetUrl: string;
  journey: JourneyResult;
}

export function buildReport({ runId, seed, targetUrl, journey }: BuildReportInput): Report {
  const steps = journey.steps.map(toReportStep);
  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    runId,
    startedAt: new Date(journey.startedAt).toISOString(),
    finishedAt: new Date(journey.finishedAt).toISOString(),
    seed,
    targetUrl,
    status: overallStatus(journey),
    ...(journey.failure && { failure: journey.failure }),
    steps,
    evidence: [...new Set(steps.flatMap((s) => s.evidence))],
  };
}

function overallStatus(journey: JourneyResult): OverallStatus {
  if (journey.failure) return journey.failure.kind === "unobservable" ? "run_error" : "fail";
  return journey.steps.some((s) => s.status === "degraded") ? "degraded" : "ok";
}

function toReportStep(step: StepResult): ReportStep {
  return { ...step, startedAt: new Date(step.startedAt).toISOString() };
}
