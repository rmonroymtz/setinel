import { describe, expect, it } from "vitest";
import { parseCliArgs, UsageError } from "../../src/cli/args.ts";
import { exitCodeFor, formatSummary } from "../../src/cli/summary.ts";
import type { Report } from "../../src/report/build-report.ts";

describe("parseCliArgs", () => {
  it("applies defaults", () => {
    expect(parseCliArgs([], {})).toEqual({
      help: false,
      baseUrl: "https://chupaprecios.com.mx",
      searchTerm: "licuadora",
      headed: false,
    });
  });

  it("reads flags", () => {
    expect(
      parseCliArgs(["--url", "https://staging.test/", "--term", "taladro", "--seed", "42", "--out", "tmp/x", "--headed"], {}),
    ).toEqual({ help: false, baseUrl: "https://staging.test", searchTerm: "taladro", seed: 42, outDir: "tmp/x", headed: true });
  });

  it("reads environment variables and lets flags win", () => {
    const env = { SENTINEL_URL: "https://env.test", SENTINEL_TERM: "mesa", SENTINEL_SEED: "7", SENTINEL_OUT: "o", SENTINEL_HEADED: "1" };
    expect(parseCliArgs([], env)).toMatchObject({ baseUrl: "https://env.test", searchTerm: "mesa", seed: 7, outDir: "o", headed: true });
    expect(parseCliArgs(["--term", "silla", "--seed", "9"], env)).toMatchObject({ searchTerm: "silla", seed: 9 });
  });

  it("accepts --help", () => {
    expect(parseCliArgs(["--help"], {}).help).toBe(true);
  });

  it.each([
    [["--seed", "abc"]],
    [["--seed", "-1"]],
    [["--seed", "4294967296"]],
    [["--seed", "1.5"]],
    [["--url", "not a url"]],
    [["--url", "ftp://x.test"]],
    [["--term", "  "]],
    [["--nope"]],
  ])("rejects %j", (argv) => {
    expect(() => parseCliArgs(argv, {})).toThrow(UsageError);
  });
});

const report = (over: Partial<Report>): Report => ({
  schemaVersion: 1,
  runId: "r1",
  startedAt: "",
  finishedAt: "",
  seed: 5,
  targetUrl: "https://s.test",
  status: "ok",
  steps: [
    { name: "home", status: "ok", startedAt: "", durationMs: 1, evidence: [] },
    { name: "pdp", status: "fail", startedAt: "", durationMs: 1, evidence: [], error: { message: "price missing" }, failureKind: "site" },
  ],
  evidence: [],
  ...over,
});

describe("exitCodeFor", () => {
  it.each([
    ["ok", 0],
    ["degraded", 0],
    ["fail", 1],
    ["run_error", 2],
  ] as const)("maps %s to %i", (status, code) => {
    expect(exitCodeFor(status)).toBe(code);
  });
});

describe("formatSummary", () => {
  it("is one line with status, seed, steps and the report path", () => {
    const line = formatSummary(report({ status: "fail" }), "runs/r1/reporte.json");
    expect(line).not.toContain("\n");
    expect(line).toBe("sentinel: FAIL run=r1 seed=5 steps=home:ok,pdp:fail (pdp: price missing) report=runs/r1/reporte.json");
  });

  it("omits the failure clause when nothing failed", () => {
    const line = formatSummary(report({ status: "ok", steps: [report({}).steps[0]!] }), "x");
    expect(line).toBe("sentinel: OK run=r1 seed=5 steps=home:ok report=x");
  });
});
