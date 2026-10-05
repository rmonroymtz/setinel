const MAX_CONSOLE_ERRORS = 20;
const MAX_MESSAGE_LENGTH = 300;
// Images, fonts and the like fail all the time on a third-party-heavy storefront;
// only requests that carry page content or data are worth reporting.
const RELEVANT_TYPES = new Set(["document", "xhr", "fetch"]);

export interface FailedRequest {
  url: string;
  resourceType: string;
  status?: number;
  reason?: string;
}

export interface Diagnostics {
  consoleErrors: string[];
  /** Same-site document/xhr/fetch failures only. */
  failedRequests: FailedRequest[];
  /** Third-party failures are counted, not listed: they are noise we do not own. */
  thirdPartyFailures: number;
}

export interface DiagnosticsCollector {
  recordConsoleError(text: string): void;
  recordResponse(r: { url: string; resourceType: string; status: number }): void;
  recordRequestFailed(r: { url: string; resourceType: string; reason: string }): void;
  /** Returns what was recorded since the last call and starts over. */
  take(): Diagnostics;
}

export function createDiagnosticsCollector(siteHost: string): DiagnosticsCollector {
  const base = siteHost.replace(/^www\./, "");
  let state = fresh();

  const sameSite = (url: string): boolean => {
    try {
      const host = new URL(url).hostname.replace(/^www\./, "");
      return host === base;
    } catch {
      return false;
    }
  };

  const record = (failure: FailedRequest) => {
    if (!RELEVANT_TYPES.has(failure.resourceType)) return;
    if (sameSite(failure.url)) state.failedRequests.push(failure);
    else state.thirdPartyFailures++;
  };

  return {
    recordConsoleError(text) {
      if (state.consoleErrors.length < MAX_CONSOLE_ERRORS) state.consoleErrors.push(text.slice(0, MAX_MESSAGE_LENGTH));
    },
    recordResponse({ url, resourceType, status }) {
      if (status >= 400) record({ url, resourceType, status });
    },
    recordRequestFailed({ url, resourceType, reason }) {
      // Aborted requests are the browser cancelling its own work during navigation.
      if (reason.includes("ERR_ABORTED")) return;
      record({ url, resourceType, reason });
    },
    take() {
      const taken = state;
      state = fresh();
      return taken;
    },
  };
}

function fresh(): Diagnostics {
  return { consoleErrors: [], failedRequests: [], thirdPartyFailures: 0 };
}
