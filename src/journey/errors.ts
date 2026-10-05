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

/**
 * The network guard aborted requests that would have placed an order or set a
 * payment. Only the monitor itself can have sent them, so this is a monitor bug,
 * never a site failure: it extends UnobservableError so the runner reports it as
 * a run error (exit code 2), the same "do not blame the site" bucket as a run
 * that could not see the site, and the run fails loudly instead of degrading.
 */
export class OrderPlacementBlockedError extends UnobservableError {
  readonly requests: string[];

  constructor(requests: string[]) {
    super(
      `The network guard blocked ${requests.length} order-placing request(s): the monitor tried to place an order or set a payment, which is a monitor bug, not a site failure`,
      { detail: requests.join("\n") },
    );
    this.name = "OrderPlacementBlockedError";
    this.requests = [...requests];
  }
}

/**
 * `safeClick` refused to click a control that reads like placing the order or
 * paying, before anything was sent. As with OrderPlacementBlockedError, only the
 * monitor can have aimed at that control, so this is a monitor bug and a run
 * error (exit code 2), never a site failure.
 */
export class OrderPlacementRefusedError extends UnobservableError {
  readonly selector: string;

  constructor(selector: string, reason: string) {
    super(
      `Refused to click ${selector}: ${reason}. The journey never places an order or starts a payment; trying to is a monitor bug, not a site failure`,
    );
    this.name = "OrderPlacementRefusedError";
    this.selector = selector;
  }
}
