import { describe, expect, it } from "vitest";
import { CONTEXT_OPTIONS } from "../../src/adapters/playwright-browser.ts";

describe("playwright browser context options", () => {
  it("present a real desktop Chrome, not Playwright's default user agent", () => {
    expect(CONTEXT_OPTIONS.userAgent).toMatch(/^Mozilla\/5\.0 \(Windows NT 10\.0; Win64; x64\).*Chrome\/\d+\.0\.0\.0 Safari\/537\.36$/);
    expect(CONTEXT_OPTIONS.userAgent).not.toMatch(/Headless/);
  });

  it("use the Mexican locale and timezone", () => {
    expect(CONTEXT_OPTIONS).toMatchObject({ locale: "es-MX", timezoneId: "America/Mexico_City" });
  });
});
