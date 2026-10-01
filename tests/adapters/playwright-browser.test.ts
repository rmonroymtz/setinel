import { describe, expect, it } from "vitest";
import { CONTEXT_OPTIONS, meetsCondition } from "../../src/adapters/playwright-browser.ts";
import type { ElementInfo } from "../../src/ports/browser.ts";

describe("playwright browser context options", () => {
  it("present a real desktop Chrome, not Playwright's default user agent", () => {
    expect(CONTEXT_OPTIONS.userAgent).toMatch(/^Mozilla\/5\.0 \(Windows NT 10\.0; Win64; x64\).*Chrome\/\d+\.0\.0\.0 Safari\/537\.36$/);
    expect(CONTEXT_OPTIONS.userAgent).not.toMatch(/Headless/);
  });

  it("use the Mexican locale and timezone", () => {
    expect(CONTEXT_OPTIONS).toMatchObject({ locale: "es-MX", timezoneId: "America/Mexico_City" });
  });
});

describe("meetsCondition", () => {
  const el = (visible: boolean): ElementInfo => ({ text: "", href: null, alt: null, naturalWidth: 0, disabled: false, visible });

  it("treats gone as no visible match", () => {
    expect(meetsCondition([], "gone")).toBe(true);
    expect(meetsCondition([el(false), el(false)], "gone")).toBe(true);
  });

  it("is not gone while any match is still visible", () => {
    expect(meetsCondition([el(false), el(true)], "gone")).toBe(false);
  });

  it("needs at least one visible match for visible", () => {
    expect(meetsCondition([], "visible")).toBe(false);
    expect(meetsCondition([el(false), el(true)], "visible")).toBe(true);
  });
});
