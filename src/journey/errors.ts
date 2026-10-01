/**
 * Signals that the run could not observe the site (blocked, 403, network),
 * as opposed to the site itself being broken.
 */
export class UnobservableError extends Error {
  readonly detail: string | undefined;

  constructor(message: string, options: { detail?: string; cause?: unknown } = {}) {
    super(message, { cause: options.cause });
    this.name = "UnobservableError";
    this.detail = options.detail;
  }
}
