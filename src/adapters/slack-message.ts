import type { OverallStatus, Report, ReportStep } from "../report/build-report.ts";
import { REPORT_FILENAME } from "../report/build-report.ts";
import type { FailureKind, StepStatus } from "../journey/step-result.ts";

/** Slack rejects section/context texts above 3000 characters. */
export const SLACK_SECTION_LIMIT = 3000;
const SLACK_HEADER_LIMIT = 150;
const SLACK_FIELD_LIMIT = 2000;
/** Room for several problem steps inside one section. */
const ERROR_MESSAGE_LIMIT = 1200;

export interface SlackText {
  type: "mrkdwn" | "plain_text";
  text: string;
  emoji?: boolean;
}

export interface SlackBlock {
  type: "header" | "section" | "context";
  text?: SlackText;
  fields?: SlackText[];
  elements?: SlackText[];
}

export interface SlackMessage {
  /** Fallback shown in notifications and by clients that cannot render blocks. */
  text: string;
  blocks: SlackBlock[];
}

export interface SlackMessageOptions {
  /** The run output directory as the reader should find it, e.g. `runs/<runId>`. */
  evidenceDir: string;
}

const STATUS_LABEL: Record<OverallStatus, { emoji: string; label: string; meaning: string }> = {
  ok: { emoji: ":white_check_mark:", label: "OK", meaning: "the purchase path works" },
  degraded: { emoji: ":warning:", label: "DEGRADED", meaning: "the path works but some requests failed" },
  fail: { emoji: ":x:", label: "FAIL", meaning: "the site is broken" },
  run_error: { emoji: ":no_entry:", label: "RUN ERROR", meaning: "the site could not be observed" },
};

const STEP_EMOJI: Record<StepStatus, string> = {
  ok: ":white_check_mark:",
  degraded: ":warning:",
  fail: ":x:",
  skipped: ":white_circle:",
};

const FAILURE_KIND_LABEL: Record<FailureKind, string> = {
  site: "site failure (the site is broken)",
  unobservable: "unobservable (run error: the site could not be seen)",
};

/** Pure: renders a run report as a Slack Block Kit message with a plain fallback. */
export function formatSlackMessage(report: Report, { evidenceDir }: SlackMessageOptions): SlackMessage {
  const status = STATUS_LABEL[report.status];
  const product = pickedProduct(report.steps);
  const duration = formatDuration(Date.parse(report.finishedAt) - Date.parse(report.startedAt));
  const failed = report.failure && report.steps.find((s) => s.name === report.failure?.step);

  const fields: SlackText[] = [
    mrkdwn(`*Target*\n${escape(report.targetUrl)}`),
    mrkdwn(`*Run*\n\`${escape(report.runId)}\``),
    mrkdwn(`*Started*\n${formatTimestamp(report.startedAt)}`),
    mrkdwn(`*Duration*\n${duration}`),
    mrkdwn(`*Seed*\n\`${report.seed}\``),
    ...(product ? [mrkdwn(`*Product*\n${product}`)] : []),
  ].map((field) => ({ ...field, text: truncate(field.text, SLACK_FIELD_LIMIT) }));

  const stepLines = report.steps.map(
    (s) => `${STEP_EMOJI[s.status]} \`${escape(s.name)}\` ${s.status}${s.status === "skipped" ? "" : ` · ${formatDuration(s.durationMs)}`}`,
  );

  const blocks: SlackBlock[] = [
    { type: "header", text: { type: "plain_text", emoji: true, text: truncate(`${status.emoji} Sentinel ${status.label}: ${status.meaning}`, SLACK_HEADER_LIMIT) } },
    { type: "section", fields },
    { type: "section", text: mrkdwn(truncate(["*Steps*", ...stepLines].join("\n"), SLACK_SECTION_LIMIT)) },
  ];

  const problems = report.steps.filter((s) => s.status === "fail" || s.status === "degraded").map(describeProblem);
  if (problems.length > 0) {
    blocks.push({ type: "section", text: mrkdwn(truncate(problems.join("\n\n"), SLACK_SECTION_LIMIT)) });
  }
  blocks.push({ type: "context", elements: [mrkdwn(truncate(evidenceLine(report, evidenceDir), SLACK_SECTION_LIMIT))] });

  const why = failed ? ` · ${failed.name}: ${failed.error?.message ?? "failed"}` : "";
  const text = truncate(
    escape(`Sentinel ${status.label}: ${status.meaning} · ${report.targetUrl} · run ${report.runId}${why}`),
    SLACK_SECTION_LIMIT,
  );
  return { text, blocks };
}

function describeProblem(step: ReportStep): string {
  const kind = step.status === "fail" ? ` — ${FAILURE_KIND_LABEL[step.failureKind ?? "site"]}` : "";
  const label = step.status === "fail" ? "Failing step" : "Degraded step";
  const message = truncate(escape(step.error?.message ?? "no error message"), ERROR_MESSAGE_LIMIT);
  return `${STEP_EMOJI[step.status]} *${label}* \`${escape(step.name)}\`${kind}\n> ${message.replace(/\n/g, "\n> ")}`;
}

function evidenceLine(report: Report, dir: string): string {
  const base = dir.replace(/\/+$/, "");
  const parts = [`report \`${escape(`${base}/${REPORT_FILENAME}`)}\``];
  if (report.evidence.some((p) => p.startsWith("screenshots/")) || report.steps.some((s) => s.evidence.length > 0)) {
    parts.push(`screenshots \`${escape(`${base}/screenshots/`)}\``);
  }
  if (report.evidence.includes("trace.zip")) parts.push(`trace \`${escape(`${base}/trace.zip`)}\``);
  return `:file_folder: Evidence: ${parts.join(" · ")}`;
}

/** The product the product page opened, else the first pick. */
function pickedProduct(steps: ReportStep[]): string | undefined {
  const pdp = steps.find((s) => s.name === "pdp")?.metadata;
  if (pdp && typeof pdp.title === "string" && typeof pdp.url === "string") {
    const price = typeof pdp.priceMxn === "number" ? ` · ${formatMxn(pdp.priceMxn)}` : "";
    return `${link(pdp.url, pdp.title)}${price}`;
  }
  const picked = steps.find((s) => s.name === "pick-product")?.metadata?.product;
  if (picked && typeof picked === "object" && "name" in picked && "url" in picked) {
    const { name, url } = picked as { name: unknown; url: unknown };
    if (typeof name === "string" && typeof url === "string") return link(url, name);
  }
  return undefined;
}

function link(url: string, label: string): string {
  // `|` and `>` would end the link early.
  return `<${url.replace(/[|>\s]/g, encodeURIComponent)}|${escape(truncate(label, 200)).replace(/\|/g, "¦")}>`;
}

function mrkdwn(text: string): SlackText {
  return { type: "mrkdwn", text };
}

/** Slack treats `&`, `<` and `>` as control characters in message text. */
function escape(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Cuts to `max` characters, never splitting an escaped entity. */
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).replace(/&[a-z]*$/, "")}…`;
}

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "n/a";
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const totalSeconds = Math.round(ms / 1000);
  return `${Math.floor(totalSeconds / 60)}m ${String(totalSeconds % 60).padStart(2, "0")}s`;
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return escape(iso);
  return `${date.toISOString().slice(0, 19).replace("T", " ")} UTC`;
}

function formatMxn(amount: number): string {
  return `$${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN`;
}
