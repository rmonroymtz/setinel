import { describe, expect, it } from "vitest";
import { formatSlackMessage, SLACK_SECTION_LIMIT } from "../../src/adapters/slack-message.ts";
import type { Report, ReportStep } from "../../src/report/build-report.ts";

const step = (name: string, status: ReportStep["status"], extra: Partial<ReportStep> = {}): ReportStep => ({
  name,
  status,
  startedAt: "2026-10-05T12:00:01.000Z",
  durationMs: 1250,
  evidence: [`screenshots/${name}.png`],
  ...extra,
});

const report = (overrides: Partial<Report> = {}): Report => ({
  schemaVersion: 1,
  runId: "20261005T120000Z",
  startedAt: "2026-10-05T12:00:00.000Z",
  finishedAt: "2026-10-05T12:01:05.000Z",
  seed: 441283603,
  targetUrl: "https://chupaprecios.com.mx",
  status: "ok",
  steps: [
    step("home", "ok"),
    step("pick-product", "ok", {
      metadata: { product: { name: "Ninja Blender BN301", url: "https://chupaprecios.com.mx/ninja.html" } },
    }),
    step("checkout", "ok", { durationMs: 20_400 }),
  ],
  evidence: ["screenshots/home.png", "trace.zip"],
  ...overrides,
});

const options = { evidenceDir: "runs/20261005T120000Z" };

/** Every text a reader could see in the message: fallback plus all blocks. */
function allText(message: ReturnType<typeof formatSlackMessage>): string {
  return [message.text, JSON.stringify(message.blocks)].join("\n");
}

function sectionTexts(message: ReturnType<typeof formatSlackMessage>): string[] {
  return message.blocks.flatMap((block) => {
    const texts: string[] = [];
    if (block.text) texts.push(block.text.text);
    for (const field of block.fields ?? []) texts.push(field.text);
    for (const element of block.elements ?? []) texts.push(element.text);
    return texts;
  });
}

describe("formatSlackMessage", () => {
  it("labels each overall status clearly in the fallback text and the header", () => {
    const labels = {
      ok: "OK",
      degraded: "DEGRADED",
      fail: "FAIL",
      run_error: "RUN ERROR",
    } as const;
    for (const [status, label] of Object.entries(labels)) {
      const message = formatSlackMessage(report({ status: status as Report["status"] }), options);
      expect(message.text).toContain(`Sentinel ${label}`);
      expect(message.blocks[0]).toMatchObject({ type: "header" });
      expect(message.blocks[0]?.text?.text).toContain(label);
    }
  });

  it("shows target, run id, start time, duration, seed and the picked product", () => {
    const text = allText(formatSlackMessage(report(), options));
    expect(text).toContain("https://chupaprecios.com.mx");
    expect(text).toContain("20261005T120000Z");
    expect(text).toContain("2026-10-05 12:00:00 UTC");
    expect(text).toContain("1m 05s");
    expect(text).toContain("441283603");
    expect(text).toContain("<https://chupaprecios.com.mx/ninja.html|Ninja Blender BN301>");
  });

  it("prefers the product the product page actually opened over the first pick", () => {
    const text = allText(
      formatSlackMessage(
        report({
          steps: [
            step("pick-product", "ok", { metadata: { product: { name: "First pick", url: "https://x.test/a" } } }),
            step("pdp", "ok", { metadata: { title: "Second candidate", url: "https://x.test/b", priceMxn: 2137.57 } }),
          ],
        }),
        options,
      ),
    );
    expect(text).toContain("<https://x.test/b|Second candidate>");
    expect(text).toContain("$2,137.57 MXN");
    expect(text).not.toContain("First pick");
  });

  it("omits the product when no product was picked", () => {
    const message = formatSlackMessage(report({ steps: [step("home", "ok")] }), options);
    expect(allText(message)).not.toContain("Product");
  });

  it("lists one line per step with its status and duration", () => {
    const message = formatSlackMessage(
      report({
        status: "fail",
        failure: { step: "pick-product", kind: "site" },
        steps: [step("home", "ok"), step("pick-product", "fail", { error: { message: "no cards" } }), step("pdp", "skipped", { durationMs: 0 })],
      }),
      options,
    );
    const steps = sectionTexts(message).find((t) => t.startsWith("*Steps*"));
    expect(steps?.split("\n")).toEqual([
      "*Steps*",
      expect.stringMatching(/home.*ok.*1\.3s/),
      expect.stringMatching(/pick-product.*fail.*1\.3s/),
      expect.stringMatching(/pdp.*skipped/),
    ]);
  });

  it("explains a failing step with its error and a site failure kind", () => {
    const text = allText(
      formatSlackMessage(
        report({
          status: "fail",
          failure: { step: "checkout", kind: "site" },
          steps: [step("checkout", "fail", { error: { message: "The checkout subtotal does not match" }, failureKind: "site" })],
        }),
        options,
      ),
    );
    expect(text).toContain("The checkout subtotal does not match");
    expect(text).toMatch(/checkout.*site failure/s);
  });

  it("marks a run error as unobservable, not as a broken site", () => {
    const text = allText(
      formatSlackMessage(
        report({
          status: "run_error",
          failure: { step: "home", kind: "unobservable" },
          steps: [step("home", "fail", { error: { message: "HTTP 403" }, failureKind: "unobservable" })],
        }),
        options,
      ),
    );
    expect(text).toContain("HTTP 403");
    expect(text).toContain("unobservable");
    expect(text).not.toContain("site failure");
  });

  it("explains a degraded step with its error", () => {
    const text = allText(
      formatSlackMessage(
        report({
          status: "degraded",
          steps: [step("search", "degraded", { error: { message: "2 same-site request(s) failed during this step" } })],
        }),
        options,
      ),
    );
    expect(text).toContain("2 same-site request(s) failed during this step");
  });

  it("says where the evidence lives", () => {
    const text = allText(formatSlackMessage(report(), options));
    expect(text).toContain("runs/20261005T120000Z/reporte.json");
    expect(text).toContain("runs/20261005T120000Z/screenshots/");
    expect(text).toContain("runs/20261005T120000Z/trace.zip");
  });

  it("truncates very long error messages to Slack's block text limit", () => {
    const message = formatSlackMessage(
      report({
        status: "fail",
        failure: { step: "checkout", kind: "site" },
        steps: [step("checkout", "fail", { error: { message: "x&".repeat(5_000) }, failureKind: "site" })],
      }),
      options,
    );
    for (const text of sectionTexts(message)) expect(text.length).toBeLessThanOrEqual(SLACK_SECTION_LIMIT);
    expect(message.text.length).toBeLessThanOrEqual(SLACK_SECTION_LIMIT);
    expect(allText(message)).toContain("…");
    const header = message.blocks[0]?.text?.text ?? "";
    expect(header.length).toBeLessThanOrEqual(150);
  });

  it("escapes Slack control characters coming from the site", () => {
    const text = allText(
      formatSlackMessage(
        report({
          status: "fail",
          failure: { step: "pdp", kind: "site" },
          steps: [step("pdp", "fail", { error: { message: "saw <b>Tom & Jerry</b> <!channel>" }, failureKind: "site" })],
        }),
        options,
      ),
    );
    expect(text).toContain("saw &lt;b&gt;Tom &amp; Jerry&lt;/b&gt; &lt;!channel&gt;");
    expect(text).not.toContain("<!channel>");
  });
});
