import type { OverallStatus, Report } from "../report/build-report.ts";

/** 0 ok or degraded, 1 the site is broken, 2 we could not observe the site. */
export function exitCodeFor(status: OverallStatus): 0 | 1 | 2 {
  switch (status) {
    case "ok":
    case "degraded":
      return 0;
    case "fail":
      return 1;
    case "run_error":
      return 2;
  }
}

export function formatSummary(report: Report, reportPath: string): string {
  const steps = report.steps.map((s) => `${s.name}:${s.status}`).join(",");
  const failed = report.steps.find((s) => s.status === "fail");
  const why = failed ? ` (${failed.name}: ${failed.error?.message ?? "failed"})` : "";
  return `sentinel: ${report.status.toUpperCase()} run=${report.runId} seed=${report.seed} steps=${steps}${why} report=${reportPath}`;
}
