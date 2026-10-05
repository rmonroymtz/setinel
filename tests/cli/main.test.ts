import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { main } from "../../src/cli/main.ts";
import type { BrowserSession } from "../../src/ports/browser.ts";
import type { Report } from "../../src/report/build-report.ts";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "sentinel-main-"));
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(dir, { recursive: true, force: true });
});

const failingLaunch = () => Promise.reject(new Error("browserType.launch: Executable doesn't exist at /ms-playwright/chromium"));

function recordingNotifier() {
  const sent: { report: Report; evidenceDir: string }[] = [];
  const notify = async (report: Report, options: { evidenceDir: string }) => void sent.push({ report, evidenceDir: options.evidenceDir });
  return { sent, notify };
}

describe("main", () => {
  it("writes a run_error report and notifies when the browser cannot start", async () => {
    const outDir = join(dir, "run");
    const { sent, notify } = recordingNotifier();

    const code = await main(["--out", outDir, "--seed", "7"], {}, { openBrowser: failingLaunch, notify });

    expect(code).toBe(2);
    const written = JSON.parse(await readFile(join(outDir, "reporte.json"), "utf8")) as Report;
    expect(written).toMatchObject({ status: "run_error", seed: 7, failure: { step: "start-browser", kind: "unobservable" } });
    expect(written.steps).toHaveLength(1);
    expect(written.steps[0]?.error?.message).toMatch(/could not start the browser.*Executable doesn't exist/i);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.report).toEqual(written);
    expect(sent[0]?.evidenceDir).toBe(outDir);
  });

  it("still notifies, with what is known, when the report itself cannot be written", async () => {
    const blocker = join(dir, "not-a-directory");
    await writeFile(blocker, "");
    const { sent, notify } = recordingNotifier();

    const code = await main(["--out", join(blocker, "run")], {}, { openBrowser: failingLaunch, notify });

    expect(code).toBe(2);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.report.status).toBe("run_error");
    expect(sent[0]?.report.steps.map((s) => s.name)).toEqual(["start-browser", "save-report"]);
    expect(sent[0]?.report.steps[1]?.error?.message).toMatch(/could not write reporte\.json/i);
  });

  it("reports and notifies any other error raised before the report exists", async () => {
    const outDir = join(dir, "run");
    const { sent, notify } = recordingNotifier();
    const closed = vi.fn(async () => ({ trace: new Uint8Array() }));
    const brokenSession = {
      get page(): never {
        throw new Error("session has no page");
      },
      close: closed,
    } as unknown as BrowserSession;

    const code = await main(["--out", outDir], {}, { openBrowser: async () => brokenSession, notify });

    expect(code).toBe(2);
    expect(sent[0]?.report).toMatchObject({ status: "run_error", failure: { step: "run", kind: "unobservable" } });
    expect(sent[0]?.report.steps[0]?.error?.message).toMatch(/session has no page/);
    expect(closed).toHaveBeenCalledOnce();
  });

  it("keeps exit code 2 when the notification itself fails", async () => {
    const code = await main(["--out", join(dir, "run")], {}, {
      openBrowser: failingLaunch,
      notify: () => Promise.reject(new Error("boom")),
    });

    expect(code).toBe(2);
  });
});
