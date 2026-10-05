import { describe, expect, it, vi } from "vitest";
import { SlackWebhookNotifier } from "../../src/adapters/slack-webhook-notifier.ts";
import type { Report } from "../../src/report/build-report.ts";

const WEBHOOK = "https://hooks.slack.test/services/T000/B000/secret-token";

const report: Report = {
  schemaVersion: 1,
  runId: "run-1",
  startedAt: "2026-10-05T12:00:00.000Z",
  finishedAt: "2026-10-05T12:00:05.000Z",
  seed: 1,
  targetUrl: "https://example.test",
  status: "ok",
  steps: [],
  evidence: [],
};

const okFetch = () => vi.fn<typeof fetch>(async () => new Response("ok", { status: 200 }));

describe("SlackWebhookNotifier", () => {
  it("posts the formatted message as JSON to the webhook", async () => {
    const fetchFn = okFetch();
    await new SlackWebhookNotifier({ webhookUrl: WEBHOOK, evidenceDir: "runs/run-1", fetch: fetchFn }).notify(report);

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe(WEBHOOK);
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("content-type")).toBe("application/json");
    const body = JSON.parse(String(init?.body));
    expect(body.text).toContain("Sentinel OK");
    expect(Array.isArray(body.blocks)).toBe(true);
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("rejects on a non-2xx answer without exposing the webhook URL", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => new Response("invalid_payload", { status: 400 }));
    const notifier = new SlackWebhookNotifier({ webhookUrl: WEBHOOK, evidenceDir: "runs/run-1", fetch: fetchFn });

    const error = await notifier.notify(report).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("HTTP 400");
    expect((error as Error).message).toContain("invalid_payload");
    expect((error as Error).message).not.toContain("secret-token");
  });

  it("redacts a webhook URL echoed in the answer body before truncating it", async () => {
    // The 200-character cut lands inside the echoed URL, right after "secret".
    const echoed = `${"x".repeat(150)}${WEBHOOK}`;
    const fetchFn = vi.fn<typeof fetch>(async () => new Response(echoed, { status: 502 }));
    const notifier = new SlackWebhookNotifier({ webhookUrl: WEBHOOK, evidenceDir: "runs/run-1", fetch: fetchFn });

    const error = (await notifier.notify(report).catch((e: unknown) => e)) as Error;
    expect(error.message).toContain("HTTP 502");
    expect(error.message).not.toContain("/services/T000");
    expect(error.message).not.toContain("secret");
  });

  it("rejects on a network error without exposing the webhook URL", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => {
      throw new TypeError(`Failed to parse URL from ${WEBHOOK}`);
    });
    const notifier = new SlackWebhookNotifier({ webhookUrl: WEBHOOK, evidenceDir: "runs/run-1", fetch: fetchFn });

    const error = (await notifier.notify(report).catch((e: unknown) => e)) as Error;
    expect(error.message).toContain("Failed to parse URL");
    expect(error.message).not.toContain("secret-token");
  });

  it("gives up after the timeout", async () => {
    const fetchFn = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
    );
    const notifier = new SlackWebhookNotifier({ webhookUrl: WEBHOOK, evidenceDir: "runs/run-1", fetch: fetchFn, timeoutMs: 20 });

    await expect(notifier.notify(report)).rejects.toThrow(/timed out after 20 ms/);
  });

  it("defaults to a 10 second timeout", () => {
    expect(new SlackWebhookNotifier({ webhookUrl: WEBHOOK, evidenceDir: "x" }).timeoutMs).toBe(10_000);
  });
});
