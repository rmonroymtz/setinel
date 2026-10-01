import { describe, expect, it } from "vitest";
import { runJourney } from "../../src/journey/run-journey.ts";
import { UnobservableError } from "../../src/journey/errors.ts";
import type { JourneyStep } from "../../src/journey/run-journey.ts";

// Each clock read advances 10ms so durations are deterministic.
function fakeClock(start = 1_000, tick = 10) {
  let t = start - tick;
  return () => (t += tick);
}

type Ctx = { log: string[] };

function step(name: string, run: JourneyStep<Ctx>["run"]): JourneyStep<Ctx> {
  return { name, run };
}

describe("runJourney", () => {
  it("runs steps sequentially, sharing the context", async () => {
    const ctx: Ctx = { log: [] };
    const result = await runJourney({
      steps: [
        step("a", async (c) => void c.log.push("a")),
        step("b", async (c) => void c.log.push(`b after ${c.log.join(",")}`)),
      ],
      context: ctx,
      now: fakeClock(),
    });

    expect(ctx.log).toEqual(["a", "b after a"]);
    expect(result.steps.map((s) => [s.name, s.status])).toEqual([
      ["a", "ok"],
      ["b", "ok"],
    ]);
  });

  it("records startedAt and durationMs from the injected clock", async () => {
    const result = await runJourney({
      steps: [step("a", async () => {})],
      context: { log: [] },
      now: fakeClock(1_000, 10),
    });

    expect(result.startedAt).toBe(1_000);
    expect(result.steps[0]).toMatchObject({ startedAt: 1_010, durationMs: 10 });
    expect(result.finishedAt).toBe(1_030);
  });

  it("marks a throwing step as fail and the rest as skipped", async () => {
    const ran: string[] = [];
    const result = await runJourney({
      steps: [
        step("a", async () => void ran.push("a")),
        step("b", async () => {
          throw new Error("boom");
        }),
        step("c", async () => void ran.push("c")),
        step("d", async () => void ran.push("d")),
      ],
      context: { log: [] },
      now: fakeClock(),
    });

    expect(ran).toEqual(["a"]);
    expect(result.steps.map((s) => s.status)).toEqual(["ok", "fail", "skipped", "skipped"]);
    expect(result.steps[1]?.error?.message).toBe("boom");
    expect(result.steps[1]?.failureKind).toBe("site");
    expect(result.steps[2]?.durationMs).toBe(0);
  });

  it("treats an explicit fail result as a failure and stops", async () => {
    const result = await runJourney({
      steps: [
        step("a", async () => ({
          status: "fail",
          error: { message: "price missing", detail: "no .price node" },
          evidence: ["a.png"],
        })),
        step("b", async () => {}),
      ],
      context: { log: [] },
      now: fakeClock(),
    });

    expect(result.steps[0]).toMatchObject({
      status: "fail",
      failureKind: "site",
      error: { message: "price missing", detail: "no .price node" },
      evidence: ["a.png"],
    });
    expect(result.steps[1]?.status).toBe("skipped");
  });

  it("keeps going after a degraded step and keeps its metadata", async () => {
    const result = await runJourney({
      steps: [
        step("a", async () => ({
          status: "degraded",
          error: { message: "console errors" },
          metadata: { consoleErrors: 2 },
        })),
        step("b", async () => {}),
      ],
      context: { log: [] },
      now: fakeClock(),
    });

    expect(result.steps.map((s) => s.status)).toEqual(["degraded", "ok"]);
    expect(result.steps[0]?.metadata).toEqual({ consoleErrors: 2 });
    expect(result.failure).toBeUndefined();
  });

  it("flags an UnobservableError as a run error, not a site failure", async () => {
    const result = await runJourney({
      steps: [
        step("home", async () => {
          throw new UnobservableError("HTTP 403 from the edge", { detail: "blocked" });
        }),
        step("search", async () => {}),
      ],
      context: { log: [] },
      now: fakeClock(),
    });

    expect(result.steps[0]).toMatchObject({
      status: "fail",
      failureKind: "unobservable",
      error: { message: "HTTP 403 from the edge", detail: "blocked" },
    });
    expect(result.failure).toEqual({ step: "home", kind: "unobservable" });
  });

  it("reports the first site failure on the journey result", async () => {
    const result = await runJourney({
      steps: [
        step("a", async () => {
          throw new Error("nope");
        }),
      ],
      context: { log: [] },
      now: fakeClock(),
    });

    expect(result.failure).toEqual({ step: "a", kind: "site" });
  });

  it("supports a step returning an explicit unobservable result", async () => {
    const result = await runJourney({
      steps: [step("a", async () => ({ status: "fail", unobservable: true, error: { message: "captcha" } }))],
      context: { log: [] },
      now: fakeClock(),
    });

    expect(result.steps[0]?.failureKind).toBe("unobservable");
  });

  it("coerces non-Error throws into a message", async () => {
    const result = await runJourney({
      steps: [
        step("a", async () => {
          throw "plain string";
        }),
      ],
      context: { log: [] },
      now: fakeClock(),
    });

    expect(result.steps[0]?.error?.message).toBe("plain string");
  });
});
