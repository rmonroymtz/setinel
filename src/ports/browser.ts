import type { Diagnostics } from "../diagnostics/collector.ts";

export interface NavigationResult {
  status: number;
  url: string;
  title: string;
  /** Length of the rendered body text; an empty shell is a "could not see" signal. */
  bodyTextLength: number;
}

/** What a step may ask about a matched element; only as wide as the steps need. */
export interface ElementInfo {
  text: string;
  href: string | null;
  alt: string | null;
  naturalWidth: number;
  disabled: boolean;
  visible: boolean;
}

/** `loaded` means an image that has decoded (naturalWidth > 0). */
/** `gone` holds when no match is visible, e.g. loading placeholders have been replaced. */
export type Condition = "visible" | "enabled" | "loaded" | "gone";

export interface Page {
  goto(url: string): Promise<NavigationResult>;
  /** Types the term into the field and presses Enter, waiting for the navigation to settle. */
  submit(selector: string, text: string): Promise<void>;
  /** Replaces the value of the first visible match. */
  fill(selector: string, value: string): Promise<void>;
  /** Types into the first visible match key by key, for widgets (address search) that ignore a pasted value. */
  type(selector: string, text: string): Promise<void>;
  queryAll(selector: string): Promise<ElementInfo[]>;
  /** Clicks the first visible match. Throws when nothing clickable shows up in time. */
  click(selector: string): Promise<void>;
  /** True when some match reaches the condition within the timeout. Never throws on timeout. */
  waitFor(selector: string, condition: Condition, timeoutMs: number): Promise<boolean>;
  screenshot(): Promise<Uint8Array>;
  /** Console errors and failed requests recorded since the last call. */
  takeDiagnostics(): Diagnostics;
}

export interface BrowserSession {
  page: Page;
  /** Ends the session and returns the Playwright trace of the whole run. */
  close(): Promise<{ trace: Uint8Array }>;
}

export interface Browser {
  open(options: { siteHost: string; headed: boolean }): Promise<BrowserSession>;
}
