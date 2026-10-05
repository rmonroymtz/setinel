import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import type { BrowserContext, Page as PlaywrightPage } from "playwright";
import { createDiagnosticsCollector } from "../diagnostics/collector.ts";
import { mayPlaceOrder, orderPlacingReason } from "../site/order-guard.ts";
import type { Browser, BrowserSession, Condition, ElementInfo, NavigationResult, Page } from "../ports/browser.ts";

/**
 * The site answers 403, or an error page that looks like content, to Playwright's
 * default user agent. Present a real desktop Chrome instead.
 */
export const CONTEXT_OPTIONS = {
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  locale: "es-MX",
  timezoneId: "America/Mexico_City",
  viewport: { width: 1366, height: 900 },
} as const;

const NAVIGATION_TIMEOUT_MS = 30_000;
const CLICK_TIMEOUT_MS = 10_000;
const FILL_TIMEOUT_MS = 10_000;
// Slow enough for the address search to react to each key, like a person typing.
const TYPE_DELAY_MS = 30;

export class PlaywrightBrowser implements Browser {
  async open({ siteHost, headed }: { siteHost: string; headed: boolean }): Promise<BrowserSession> {
    const browser = await chromium.launch({ headless: !headed });
    const context = await browser.newContext(CONTEXT_OPTIONS);
    context.setDefaultNavigationTimeout(NAVIGATION_TIMEOUT_MS);
    await context.tracing.start({ screenshots: true, snapshots: true });
    const blockedOrderRequests: string[] = [];
    await installOrderGuard(context, (request) => blockedOrderRequests.push(request));

    const collector = createDiagnosticsCollector(siteHost);
    const page = await context.newPage();
    page.on("console", (m) => m.type() === "error" && collector.recordConsoleError(m.text()));
    page.on("pageerror", (e) => collector.recordConsoleError(`Uncaught: ${e.message}`));
    page.on("requestfailed", (r) =>
      collector.recordRequestFailed({ url: r.url(), resourceType: r.resourceType(), reason: r.failure()?.errorText ?? "" }),
    );
    page.on("response", (r) =>
      collector.recordResponse({ url: r.url(), resourceType: r.request().resourceType(), status: r.status() }),
    );

    return {
      page: new PlaywrightPageAdapter(page, collector.take.bind(collector), () => blockedOrderRequests.splice(0)),
      async close() {
        // Tracing only writes to a path, so go through a throwaway directory.
        const dir = await mkdtemp(join(tmpdir(), "sentinel-trace-"));
        try {
          const file = join(dir, "trace.zip");
          await context.tracing.stop({ path: file });
          return { trace: new Uint8Array(await readFile(file)) };
        } finally {
          await rm(dir, { recursive: true, force: true });
          await browser.close();
        }
      },
    };
  }
}

/**
 * Last line of defence behind safeClick: whatever the page does, a request that
 * would place an order or set a payment method (GraphQL or REST, see
 * `src/site/order-guard.ts`) is aborted before it leaves the browser and reported
 * through `onBlocked`. Requests it lets through fall back to any other route.
 */
export async function installOrderGuard(
  context: Pick<BrowserContext, "route">,
  onBlocked: (request: string) => void,
): Promise<void> {
  await context.route(mayPlaceOrder, (route) => {
    const request = route.request();
    const url = request.url();
    const reason = orderPlacingReason({ method: request.method(), url, body: request.postData() });
    if (!reason) return route.fallback();
    const { origin, pathname } = new URL(url);
    onBlocked(`${request.method()} ${origin}${pathname} (${reason})`);
    return route.abort("blockedbyclient");
  });
}

class PlaywrightPageAdapter implements Page {
  readonly #page: PlaywrightPage;
  readonly takeDiagnostics: Page["takeDiagnostics"];
  readonly takeBlockedOrderRequests: Page["takeBlockedOrderRequests"];

  constructor(
    page: PlaywrightPage,
    takeDiagnostics: Page["takeDiagnostics"],
    takeBlockedOrderRequests: Page["takeBlockedOrderRequests"],
  ) {
    this.#page = page;
    this.takeDiagnostics = takeDiagnostics;
    this.takeBlockedOrderRequests = takeBlockedOrderRequests;
  }

  async goto(url: string): Promise<NavigationResult> {
    const response = await this.#page.goto(url, { waitUntil: "domcontentloaded" });
    // The SPA renders after domcontentloaded; give it a chance before judging the page.
    await this.#page.waitForLoadState("load").catch(() => {});
    await this.#page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
    const bodyTextLength = await this.#page.evaluate(() => document.body?.innerText.length ?? 0);
    return {
      status: response?.status() ?? 0,
      url: this.#page.url(),
      title: await this.#page.title(),
      bodyTextLength,
    };
  }

  async submit(selector: string, text: string): Promise<void> {
    const field = this.#page.locator(selector).first();
    await field.fill(text);
    const before = this.#page.url();
    await Promise.all([
      this.#page.waitForURL((u) => u.href !== before, { timeout: 15_000 }).catch(() => {}),
      field.press("Enter"),
    ]);
    await this.#page.waitForLoadState("load").catch(() => {});
  }

  async fill(selector: string, value: string): Promise<void> {
    await this.#visible(selector).fill(value, { timeout: FILL_TIMEOUT_MS });
  }

  async type(selector: string, text: string): Promise<void> {
    const field = this.#visible(selector);
    await field.fill("", { timeout: FILL_TIMEOUT_MS });
    await field.pressSequentially(text, { delay: TYPE_DELAY_MS });
  }

  async queryAll(selector: string): Promise<ElementInfo[]> {
    return this.#page.locator(selector).evaluateAll((els) =>
      els.map((el) => {
        const box = el.getBoundingClientRect();
        const img = el instanceof HTMLImageElement ? el : null;
        return {
          text: (el as HTMLElement).innerText ?? el.textContent ?? "",
          href: el instanceof HTMLAnchorElement ? el.href : null,
          alt: img?.alt ?? el.querySelector("img")?.alt ?? null,
          naturalWidth: img?.naturalWidth ?? 0,
          disabled: (el as HTMLButtonElement).disabled === true,
          visible: box.width > 0 && box.height > 0,
        };
      }),
    );
  }

  async click(selector: string): Promise<void> {
    await this.#visible(selector).click({ timeout: CLICK_TIMEOUT_MS });
  }

  #visible(selector: string) {
    return this.#page.locator(selector).filter({ visible: true }).first();
  }

  async waitFor(selector: string, condition: Condition, timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    do {
      if (meetsCondition(await this.queryAll(selector), condition)) return true;
      await this.#page.waitForTimeout(250);
    } while (Date.now() < deadline);
    return false;
  }

  async screenshot(): Promise<Uint8Array> {
    return new Uint8Array(await this.#page.screenshot({ fullPage: false }));
  }
}

export function meetsCondition(matches: ElementInfo[], condition: Condition): boolean {
  if (condition === "gone") return !matches.some((m) => m.visible);
  return matches.some((m) => satisfies(m, condition));
}

function satisfies(el: ElementInfo, condition: Exclude<Condition, "gone">): boolean {
  switch (condition) {
    case "visible":
      return el.visible;
    case "enabled":
      return el.visible && !el.disabled;
    case "loaded":
      return el.visible && el.naturalWidth > 0;
  }
}
