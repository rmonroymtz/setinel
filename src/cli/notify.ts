import { SlackWebhookNotifier } from "../adapters/slack-webhook-notifier.ts";
import type { Report } from "../report/build-report.ts";

export interface NotifyRunOptions {
  env: Record<string, string | undefined>;
  evidenceDir: string;
  fetch?: typeof fetch;
  log?: (line: string) => void;
  logError?: (line: string) => void;
}

/**
 * Sends the report to Slack on every run when `SLACK_WEBHOOK_URL` is set.
 * Never throws: a notification problem must not change the report or the exit
 * code. The webhook URL is a secret and is never logged.
 */
export async function notifyRun(report: Report, options: NotifyRunOptions): Promise<void> {
  const { env, evidenceDir, fetch: fetchFn, log = console.log, logError = console.error } = options;
  const webhookUrl = env.SLACK_WEBHOOK_URL?.trim();
  if (!webhookUrl) {
    log("sentinel: SLACK_WEBHOOK_URL is not set; Slack notification skipped");
    return;
  }
  try {
    await new SlackWebhookNotifier({ webhookUrl, evidenceDir, ...(fetchFn && { fetch: fetchFn }) }).notify(report);
    log("sentinel: Slack notification sent");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logError(`sentinel: Slack notification failed: ${message.replaceAll(webhookUrl, "<webhook>")}`);
  }
}
