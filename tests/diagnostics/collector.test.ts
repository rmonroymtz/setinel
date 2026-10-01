import { describe, expect, it } from "vitest";
import { createDiagnosticsCollector } from "../../src/diagnostics/collector.ts";

const SITE = "chupaprecios.com.mx";

describe("diagnostics collector", () => {
  it("records console errors, truncated and capped", () => {
    const c = createDiagnosticsCollector(SITE);
    c.recordConsoleError("x".repeat(1_000));
    for (let i = 0; i < 40; i++) c.recordConsoleError(`e${i}`);

    const d = c.take();
    expect(d.consoleErrors[0]).toHaveLength(300);
    expect(d.consoleErrors).toHaveLength(20);
  });

  it("records same-site document/xhr/fetch responses with status >= 400", () => {
    const c = createDiagnosticsCollector(SITE);
    c.recordResponse({ url: "https://chupaprecios.com.mx/api", resourceType: "fetch", status: 500 });
    c.recordResponse({ url: "https://www.chupaprecios.com.mx/x", resourceType: "document", status: 404 });
    c.recordResponse({ url: "https://chupaprecios.com.mx/ok", resourceType: "fetch", status: 200 });
    c.recordResponse({ url: "https://chupaprecios.com.mx/a.png", resourceType: "image", status: 404 });

    expect(c.take().failedRequests).toEqual([
      { url: "https://chupaprecios.com.mx/api", resourceType: "fetch", status: 500 },
      { url: "https://www.chupaprecios.com.mx/x", resourceType: "document", status: 404 },
    ]);
  });

  it("counts third-party failures instead of listing them", () => {
    const c = createDiagnosticsCollector(SITE);
    c.recordResponse({ url: "https://tracker.example/p", resourceType: "xhr", status: 503 });
    c.recordRequestFailed({ url: "https://ads.example/p", resourceType: "fetch", reason: "net::ERR_FAILED" });

    expect(c.take()).toMatchObject({ failedRequests: [], thirdPartyFailures: 2 });
  });

  it("records same-site request failures but ignores aborted navigations", () => {
    const c = createDiagnosticsCollector(SITE);
    c.recordRequestFailed({ url: "https://chupaprecios.com.mx/a", resourceType: "xhr", reason: "net::ERR_ABORTED" });
    c.recordRequestFailed({ url: "https://chupaprecios.com.mx/b", resourceType: "xhr", reason: "net::ERR_CONNECTION_RESET" });

    expect(c.take().failedRequests).toEqual([
      { url: "https://chupaprecios.com.mx/b", resourceType: "xhr", reason: "net::ERR_CONNECTION_RESET" },
    ]);
  });

  it("take() drains so each step only sees its own events", () => {
    const c = createDiagnosticsCollector(SITE);
    c.recordConsoleError("boom");
    c.take();
    expect(c.take()).toEqual({ consoleErrors: [], failedRequests: [], thirdPartyFailures: 0 });
  });
});
