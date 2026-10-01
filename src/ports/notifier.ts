import type { Report } from "../report/build-report.ts";

export interface Notifier {
  notify(report: Report): Promise<void>;
}
