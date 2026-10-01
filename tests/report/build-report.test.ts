import { describe, expect, it } from "vitest";
import { buildReport, REPORT_FILENAME } from "../../src/report/build-report.ts";
import type { JourneyResult } from "../../src/journey/run-journey.ts";
import type { StepResult } from "../../src/journey/step-result.ts";

const step = (name: string, status: StepResult["status"], extra: Partial<StepResult> = {}): StepResult => ({
  name,
  status,
  startedAt: Date.parse("2026-09-30T12:00:01.000Z"),
  durationMs: 250,
  evidence: [],
  ...extra,
});

const journey = (steps: StepResult[], failure?: JourneyResult["failure"]): JourneyResult => ({
  startedAt: Date.parse("2026-09-30T12:00:00.000Z"),
  finishedAt: Date.parse("2026-09-30T12:00:05.000Z"),
  steps,
  ...(failure && { failure }),
});

const base = { runId: "run-1", seed: 42, targetUrl: "https://example.test" };

describe("buildReport", () => {
  it("uses the agreed filename", () => {
    expect(REPORT_FILENAME).toBe("reporte.json");
  });

  it("builds the header with ISO timestamps", () => {
    const report = buildReport({ ...base, journey: journey([step("home", "ok")]) });

    expect(report).toMatchObject({
      schemaVersion: 1,
      runId: "run-1",
      seed: 42,
      targetUrl: "https://example.test",
      startedAt: "2026-09-30T12:00:00.000Z",
      finishedAt: "2026-09-30T12:00:05.000Z",
      status: "ok",
    });
  });

  it("serializes step results with ISO startedAt", () => {
    const report = buildReport({
      ...base,
      journey: journey([step("home", "ok", { metadata: { price: 10 } })]),
    });

    expect(report.steps[0]).toEqual({
      name: "home",
      status: "ok",
      startedAt: "2026-09-30T12:00:01.000Z",
      durationMs: 250,
      evidence: [],
      metadata: { price: 10 },
    });
  });

  it("is degraded when a step degraded and none failed", () => {
    const report = buildReport({ ...base, journey: journey([step("a", "degraded"), step("b", "ok")]) });
    expect(report.status).toBe("degraded");
  });

  it("is fail for a site failure", () => {
    const report = buildReport({
      ...base,
      journey: journey(
        [step("a", "fail", { failureKind: "site", error: { message: "x" } }), step("b", "skipped")],
        { step: "a", kind: "site" },
      ),
    });
    expect(report.status).toBe("fail");
    expect(report.failure).toEqual({ step: "a", kind: "site" });
  });

  it("is run_error when the site could not be observed", () => {
    const report = buildReport({
      ...base,
      journey: journey([step("a", "fail", { failureKind: "unobservable" })], { step: "a", kind: "unobservable" }),
    });
    expect(report.status).toBe("run_error");
    expect(report.failure).toEqual({ step: "a", kind: "unobservable" });
  });

  it("derives the status from steps when the journey carries no failure", () => {
    const report = buildReport({
      ...base,
      journey: journey([step("a", "fail", { failureKind: "unobservable" })]),
    });
    expect(report.status).toBe("run_error");
    expect(report.failure).toEqual({ step: "a", kind: "unobservable" });
  });

  it("treats a failed step without failureKind as a site failure", () => {
    const report = buildReport({ ...base, journey: journey([step("a", "fail")]) });
    expect(report.status).toBe("fail");
  });

  it("omits failure when nothing failed", () => {
    const report = buildReport({ ...base, journey: journey([step("a", "ok")]) });
    expect("failure" in report).toBe(false);
  });

  it("lists evidence paths once, in step order", () => {
    const report = buildReport({
      ...base,
      journey: journey([
        step("a", "degraded", { evidence: ["a.png", "trace.zip"] }),
        step("b", "fail", { evidence: ["trace.zip", "b.png"], failureKind: "site" }),
      ]),
    });
    expect(report.evidence).toEqual(["a.png", "trace.zip", "b.png"]);
    expect(report.status).toBe("fail");
  });

  it("appends run-level evidence such as the trace after step evidence", () => {
    const report = buildReport({
      ...base,
      journey: journey([step("a", "ok", { evidence: ["a.png"] })]),
      extraEvidence: ["trace.zip", "a.png"],
    });
    expect(report.evidence).toEqual(["a.png", "trace.zip"]);
  });

  it("round-trips through JSON unchanged", () => {
    const report = buildReport({ ...base, journey: journey([step("a", "ok")]) });
    expect(JSON.parse(JSON.stringify(report))).toEqual(report);
  });
});
