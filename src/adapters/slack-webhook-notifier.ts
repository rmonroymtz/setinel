import type { Notifier } from "../ports/notifier.ts";
import type { Report } from "../report/build-report.ts";
import { formatSlackMessage, type EvidenceLink } from "./slack-message.ts";

export const SLACK_TIMEOUT_MS = 10_000;

export interface SlackWebhookNotifierOptions {
  /** A secret: it never appears in errors or logs. */
  webhookUrl: string;
  /** Where the reader finds the run's evidence, e.g. `runs/<runId>`. */
  evidenceDir: string;
  /** A page holding the evidence, e.g. the CI run with the artifacts. */
  evidenceLink?: EvidenceLink;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

/**
 * Posts the run report to a Slack incoming webhook. Webhooks cannot attach
 * files, so the message points at where the evidence lives instead.
 */
export class SlackWebhookNotifier implements Notifier {
  readonly timeoutMs: number;
  readonly #webhookUrl: string;
  readonly #evidenceDir: string;
  readonly #evidenceLink: EvidenceLink | undefined;
  readonly #fetch: typeof fetch;

  constructor({ webhookUrl, evidenceDir, evidenceLink, fetch: fetchFn = fetch, timeoutMs = SLACK_TIMEOUT_MS }: SlackWebhookNotifierOptions) {
    this.#webhookUrl = webhookUrl;
    this.#evidenceDir = evidenceDir;
    this.#evidenceLink = evidenceLink;
    this.#fetch = fetchFn;
    this.timeoutMs = timeoutMs;
  }

  async notify(report: Report): Promise<void> {
    const body = JSON.stringify(formatSlackMessage(report, { evidenceDir: this.#evidenceDir, evidenceLink: this.#evidenceLink }));
    let response: Response;
    try {
      response = await this.#fetch(this.#webhookUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      const timedOut = error instanceof Error && error.name === "TimeoutError";
      const reason = timedOut ? `timed out after ${this.timeoutMs} ms` : describe(error);
      throw new Error(`Slack webhook request failed: ${this.#redact(reason)}`);
    }
    if (!response.ok) {
      // Redact before truncating: a cut through an echoed URL would leave part of the secret.
      const detail = await response.text().then((t) => this.#redact(t.trim()).slice(0, 200), () => "");
      throw new Error(`Slack webhook answered HTTP ${response.status}${detail ? `: ${detail}` : ""}`);
    }
  }

  #redact(text: string): string {
    return text.replaceAll(this.#webhookUrl, "<webhook>");
  }
}

function describe(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause instanceof Error ? ` (${error.cause.message})` : "";
  return `${error.message}${cause}`;
}
