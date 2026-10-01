export type StepStatus = "ok" | "fail" | "degraded" | "skipped";

/** Why a step failed: the site is broken, or we could not see the site. */
export type FailureKind = "site" | "unobservable";

export interface StepError {
  message: string;
  detail?: string;
}

export interface StepResult {
  name: string;
  status: StepStatus;
  startedAt: number;
  durationMs: number;
  error?: StepError;
  failureKind?: FailureKind;
  evidence: string[];
  metadata?: Record<string, unknown>;
}
