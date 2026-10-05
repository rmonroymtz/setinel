import { UnobservableError } from "../journey/errors.ts";
import type { NavigationResult, Page } from "../ports/browser.ts";
import { classifyNavigation, isNetworkError } from "../site/page-sanity.ts";

/** Opens a page and turns "could not see it" into UnobservableError and "broken" into a plain Error. */
export async function navigate(page: Page, url: string): Promise<NavigationResult> {
  let nav: NavigationResult;
  try {
    nav = await page.goto(url);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isNetworkError(message)) throw new UnobservableError(`Could not reach ${url}`, { detail: message, cause: error });
    throw error;
  }

  const verdict = classifyNavigation(nav);
  if (verdict.kind === "unobservable") {
    throw new UnobservableError(`${verdict.reason} (${url})`, { detail: `title: ${nav.title}` });
  }
  if (verdict.kind === "site") throw new Error(`${verdict.reason} (${url})`);
  return nav;
}
