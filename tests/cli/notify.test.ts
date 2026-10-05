import { describe, expect, it, vi } from "vitest";
import { notifyRun } from "../../src/cli/notify.ts";
import type { Report } from "../../src/report/build-report.ts";

const WEBHOOK = "https://hooks.slack.test/services/T000/B000/secret-token";

const report: Report = {
  schemaVersion: 1,
  runId: "run-1",
  startedAt: "2026-10-05T12:00:00.000Z",
  finishedAt: "2026-10-05T12:00:05.000Z",
  seed: 1,
  targetUrl: "https://example.test",
  status: "fail",
  failure: { step: "home", kind: "site" },
  steps: [],
  evidence: [],
};

function setup(env: Record<string, string | undefined>, fetchFn: typeof fetch) {
  const log = vi.fn<(line: string) => void>();
  const logError = vi.fn<(line: string) => void>();
  const run = () => notifyRun(report, { env, evidenceDir: "runs/run-1", fetch: fetchFn, log, logError });
  const output = () => [...log.mock.calls, ...logError.mock.calls].flat().join("\n");
  return { log, logError, run, output };
}

describe("notifyRun", () => {
  it("skips with one log line when SLACK_WEBHOOK_URL is not set", async () => {
    for (const value of [undefined, "", "   "]) {
      const fetchFn = vi.fn<typeof fetch>();
      const { log, logError, run } = setup({ SLACK_WEBHOOK_URL: value }, fetchFn);
      await run();
      expect(fetchFn).not.toHaveBeenCalled();
      expect(log).toHaveBeenCalledTimes(1);
      expect(log.mock.calls[0]?.[0]).toMatch(/SLACK_WEBHOOK_URL.*skipped/);
      expect(logError).not.toHaveBeenCalled();
    }
  });

  it("notifies on every run when the webhook is set, without logging it", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => new Response("ok"));
    const { log, run, output } = setup({ SLACK_WEBHOOK_URL: WEBHOOK }, fetchFn);
    await run();
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith("sentinel: Slack notification sent");
    expect(output()).not.toContain("secret-token");
  });

  it("links the evidence to the Bitbucket pipeline run when running in Pipelines", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => new Response("ok"));
    const { run } = setup(
      { SLACK_WEBHOOK_URL: WEBHOOK, BITBUCKET_BUILD_NUMBER: "42", BITBUCKET_REPO_FULL_NAME: "acme/sentinel" },
      fetchFn,
    );
    await run();
    const body = String(fetchFn.mock.calls[0]?.[1]?.body);
    expect(body).toContain("https://bitbucket.org/acme/sentinel/pipelines/results/42");
    expect(body).toContain("runs/run-1/reporte.json");
  });

  it("keeps local evidence paths only outside CI", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => new Response("ok"));
    const { run } = setup({ SLACK_WEBHOOK_URL: WEBHOOK }, fetchFn);
    await run();
    expect(String(fetchFn.mock.calls[0]?.[1]?.body)).not.toContain("bitbucket.org");
  });

  it("logs a Slack failure to stderr and never throws", async () => {
    const fetchFn = vi.fn<typeof fetch>(() => {
      throw new Error(`boom calling ${WEBHOOK}`);
    });
    const { logError, run, output } = setup({ SLACK_WEBHOOK_URL: WEBHOOK }, fetchFn);
    await expect(run()).resolves.toBeUndefined();
    expect(logError).toHaveBeenCalledTimes(1);
    expect(logError.mock.calls[0]?.[0]).toMatch(/^sentinel: Slack notification failed: /);
    expect(output()).not.toContain("secret-token");
  });

  it("logs a non-2xx answer as a failure", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => new Response("no_service", { status: 404 }));
    const { logError, run } = setup({ SLACK_WEBHOOK_URL: WEBHOOK }, fetchFn);
    await run();
    expect(logError.mock.calls[0]?.[0]).toContain("HTTP 404");
  });
});
