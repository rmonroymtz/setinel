import type { NavigationResult } from "../ports/browser.ts";

export type NavigationVerdict =
  | { kind: "ok" }
  /** We could not see the site (blocked, edge error page, empty shell): a run error. */
  | { kind: "unobservable"; reason: string }
  /** We saw the site and it is broken. */
  | { kind: "site"; reason: string };

// A page that answers but renders almost nothing is a shell we cannot judge.
const MIN_BODY_TEXT = 200;
const BLOCKING_STATUSES = new Set([401, 403, 407, 429]);
// Titles of the error pages CDNs and WAFs serve, often with HTTP 200.
const BLOCKED_TITLE = /\b(403|401|429)\b|forbidden|access denied|just a moment|attention required|captcha|request blocked/i;
const NETWORK_ERROR =
  /net::ERR_(NAME_NOT_RESOLVED|INTERNET_DISCONNECTED|CONNECTION_(REFUSED|RESET|CLOSED)|NETWORK_CHANGED|ADDRESS_UNREACHABLE|PROXY_CONNECTION_FAILED|TUNNEL_CONNECTION_FAILED)/;
const SOLD_OUT = /agotad[oa]|sin existencias|no disponible|out of stock|currently unavailable|sold out/i;

export function classifyNavigation(nav: NavigationResult): NavigationVerdict {
  if (nav.status === 0) return { kind: "unobservable", reason: "No HTTP response was received" };
  if (BLOCKING_STATUSES.has(nav.status)) return { kind: "unobservable", reason: `Blocked: HTTP ${nav.status}` };
  if (BLOCKED_TITLE.test(nav.title)) return { kind: "unobservable", reason: `Blocked page titled "${nav.title}"` };
  if (nav.status >= 400) return { kind: "site", reason: `HTTP ${nav.status}` };
  if (nav.bodyTextLength < MIN_BODY_TEXT) {
    return { kind: "unobservable", reason: `Page rendered only ${nav.bodyTextLength} characters of text` };
  }
  return { kind: "ok" };
}

/** Timeouts are deliberately excluded: a site that hangs is a site problem. */
export function isNetworkError(message: string): boolean {
  return NETWORK_ERROR.test(message);
}

export type Availability = "available" | "unavailable" | "broken";

/**
 * The listing does not show stock, so the product page decides. A working
 * add-to-cart button means available. A blocked button explained by sold-out
 * wording means unavailable (pick another product); unexplained, it is a defect.
 * Sold-out wording is ignored when the button works so review text cannot
 * mislead us.
 */
export function classifyAvailability(input: { addToCartEnabled: boolean; pageText: string }): Availability {
  if (input.addToCartEnabled) return "available";
  return SOLD_OUT.test(input.pageText) ? "unavailable" : "broken";
}
