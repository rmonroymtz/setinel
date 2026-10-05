import { OrderPlacementRefusedError } from "../journey/errors.ts";
import type { Page } from "../ports/browser.ts";
import { isOrderPlacingSelector, isOrderPlacingText } from "../site/order-guard.ts";

export { OrderPlacementRefusedError };

/**
 * Clicks like `page.click`, but refuses (throws, without clicking) when the
 * selector is on the order-placing denylist or a visible match reads like
 * placing the order or paying. Every checkout click goes through here. A refusal
 * is an OrderPlacementRefusedError, which the runner reports as a run error.
 */
export async function safeClick(page: Pick<Page, "queryAll" | "click">, selector: string): Promise<void> {
  if (isOrderPlacingSelector(selector)) throw new OrderPlacementRefusedError(selector, "the selector is on the order-placing denylist");
  const denied = (await page.queryAll(selector)).find((m) => m.visible && isOrderPlacingText(m.text));
  if (denied) throw new OrderPlacementRefusedError(selector, `the element reads "${denied.text.trim()}"`);
  await page.click(selector);
}
