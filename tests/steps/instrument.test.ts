import { describe, expect, it } from "vitest";
import { instrumentStep } from "../../src/steps/instrument.ts";
import type { JourneyStep } from "../../src/journey/run-journey.ts";
import type { Diagnostics } from "../../src/diagnostics/collector.ts";
import type { ArtifactStore } from "../../src/ports/artifact-store.ts";

const empty: Diagnostics = { consoleErrors: [], failedRequests: [], thirdPartyFailures: 0 };

function setup(diagnostics: Diagnostics = empty) {
  const written: string[] = [];
  const store: ArtifactStore = {
    writeJson: async (p) => p,
    writeBinary: async (p) => (written.push(p), p),
  };
  const page = {
    takeDiagnostics: () => diagnostics,
    screenshot: async () => new Uint8Array([1]),
  };
  return { written, store, page };
}

const inner = (run: JourneyStep<unknown>["run"]): JourneyStep<unknown> => ({ name: "search term", run });

describe("instrumentStep", () => {
  it("takes a screenshot of an ok step and lists it as its only evidence", async () => {
    const { page, store, written } = setup();
    const outcome = await instrumentStep(inner(async () => ({ status: "ok" })), { page, store }).run({});
    expect(written).toEqual(["screenshots/search-term.png"]);
    expect(outcome).toEqual({ status: "ok", evidence: ["screenshots/search-term.png"] });
  });

  it("takes a screenshot of a degraded step after the step's own evidence", async () => {
    const failed = { url: "https://s.test/api", resourceType: "xhr", status: 500 };
    const { page, store } = setup({ ...empty, failedRequests: [failed] });
    const outcome = await instrumentStep(inner(async () => ({ status: "ok", evidence: ["own.json"] })), {
      page,
      store,
    }).run({});
    expect(outcome).toMatchObject({ status: "degraded", evidence: ["own.json", "screenshots/search-term.png"] });
  });

  it("keeps an ok outcome when the screenshot cannot be taken", async () => {
    const { store } = setup();
    const page = {
      takeDiagnostics: () => empty,
      screenshot: async () => { throw new Error("page closed"); },
    };
    const outcome = await instrumentStep(inner(async () => {}), { page, store }).run({});
    expect(outcome).toEqual({ status: "ok", evidence: [] });
  });

  it("attaches console errors as metadata without degrading the step", async () => {
    const { page, store } = setup({ ...empty, consoleErrors: ["TypeError: x"] });
    const outcome = await instrumentStep(inner(async () => ({ status: "ok", metadata: { a: 1 } })), { page, store }).run({});
    expect(outcome).toMatchObject({ status: "ok", metadata: { a: 1, diagnostics: { consoleErrors: ["TypeError: x"] } } });
  });

  it("degrades an ok step when same-site requests failed", async () => {
    const failed = { url: "https://s.test/api", resourceType: "xhr", status: 500 };
    const { page, store } = setup({ ...empty, failedRequests: [failed] });
    const outcome = await instrumentStep(inner(async () => {}), { page, store }).run({});
    expect(outcome).toMatchObject({
      status: "degraded",
      error: { message: "1 same-site request(s) failed during this step" },
      metadata: { diagnostics: { failedRequests: [failed] } },
    });
  });

  it("takes a screenshot on a failed outcome and lists it as evidence", async () => {
    const { page, store, written } = setup();
    const outcome = await instrumentStep(inner(async () => ({ status: "fail", error: { message: "no price" } })), {
      page,
      store,
    }).run({});
    expect(written).toEqual(["screenshots/search-term.png"]);
    expect(outcome).toMatchObject({ status: "fail", evidence: ["screenshots/search-term.png"] });
  });

  it("takes a screenshot when the step throws and rethrows the same error", async () => {
    const { page, store, written } = setup();
    const boom = new Error("boom");
    await expect(
      instrumentStep(inner(async () => { throw boom; }), { page, store }).run({}),
    ).rejects.toBe(boom);
    expect(written).toEqual(["screenshots/search-term.png"]);
  });

  it("does not let a failing screenshot hide the real error", async () => {
    const { store } = setup();
    const page = {
      takeDiagnostics: () => empty,
      screenshot: async () => { throw new Error("page closed"); },
    };
    const boom = new Error("boom");
    await expect(instrumentStep(inner(async () => { throw boom; }), { page, store }).run({})).rejects.toBe(boom);
  });
});
