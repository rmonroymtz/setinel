# Guest purchase journey

## Objective

A synthetic monitor that, once a day, walks chupaprecios.com.mx like a guest
shopper — home, search, random available product, PDP, cart, checkout — stops
before paying, writes a machine-readable report, and notifies Slack.

## Problem and why

A home page that answers 200 can still have a broken "add to cart" button or
checkout. The team needs to learn about a broken purchase path before
customers do, with enough evidence to act on it.

## Scope

- In: guest journey up to the payment screen, deterministic checks per step,
  evidence on failure, `reporte.json` contract, Slack notification, Bitbucket
  scheduled pipeline (06:00 America/Mexico_City = 12:00 UTC), heartbeat.
- Out (for now): paying, logged-in test account journey (later), AI diagnosis
  and Jira tickets (a separate future tool that consumes `reporte.json`),
  interactive Slack buttons.

## Constraints

- Standalone tool; QA Centinela (`~/Proyectos/centinela`) is a reference only,
  never a dependency.
- Failure detection is deterministic. No AI in this tool.
- Never generate a real order: the journey stops before payment.
- The site returns 403 (or an error page that looks like content) to
  Playwright's default user agent: use a real browser user agent.
- Class names are CSS Modules with a build hash: anchor selectors by prefix
  (`[class*="name-"]`), roles, or `data-testid`, never the hashed class.
  Keep every selector in one module; the front is migrating `pwa` (React)
  to `storefront` (Next.js).
- Distinguish "the site is broken" from "we could not see the site"
  (blocked, 403, network): the latter is a run error, not a site failure.
- Tests never touch the network.
- Hexagonal: domain (journey, steps, results) with ports `Browser`,
  `Notifier`, `ArtifactStore`; adapters for Playwright, Slack, disk.

## TDD

- Mode: strict (on). Source: session configuration ("Strict TDD Mode: enabled").
- Runner: `pnpm test` (vitest). Typecheck: `pnpm typecheck`.

## Delivery

- Strategy: `ask-on-risk`. No remote exists yet; the chain strategy will be
  asked before the first pull request. Forecast: the full feature exceeds
  400 authored lines; work-unit commits per task.

## Checklist

### Slice 1 — home to PDP with report

- [x] T1 Scaffold: package.json (pnpm, Node >= 24, ESM), tsconfig, vitest,
      playwright, .gitignore, README stub. Route: delegated (writer, with T2–T4).
- [x] T2 Domain: step result model (`ok` / `fail` / `degraded` / `skipped`)
      and journey runner (sequential, stops at first failure and marks the
      rest `skipped`, measures duration, captures errors). Route: delegated.
- [x] T3 Seeded random selection of an available product (deterministic
      PRNG, filters out-of-stock, empty list is a failure). Route: delegated.
- [x] T4 Report contract: `reporte.json` builder (run id, timestamps, seed,
      target URL, overall status, per-step results, evidence paths) and a
      disk `ArtifactStore`. Route: delegated.
- [x] T4b Hardening from review R3 (accepted, within acceptance criteria):
      per-step timeout producing a fail/unobservable result so a hung step
      still yields a report; overall status derived from step statuses (or
      reject inconsistent input); guard error coercion in the runner catch.
      Route: delegated (with T5–T6).
- [x] T5 Playwright adapter: context with real user agent, console and
      failed-request collectors, screenshot and trace on failure, selectors
      module mapped against the live site. Route: delegated (writer + live
      site exploration).
- [x] T6 Steps home, search, pick product, PDP checks (price, image, stock,
      enabled add-to-cart), sanity check for blocked/unseen pages, CLI
      `pnpm sentinel`. Route: delegated.

- [x] T6b Screenshot of every step (not only failed ones), user request
      2026-09-30. Route: inline (1 source file + its test). TDD: RED 2
      failing tests in `tests/steps/instrument.test.ts`, GREEN 122.

- [x] T6c Search waits until every store's shimmer placeholders
      (`[class*="shimmer-root-"]`) are gone before collecting candidates;
      still shimmering after 20s is a site failure. Found through T6b
      screenshots (step passed on skeleton cards); user request 2026-09-30.
      Route: inline (small edits in port, adapter, selectors, search step;
      behavior fully understood from a live DOM probe). TDD: RED 4 failing
      tests, GREEN 126. Live: search ok, 30 results, screenshot fully rendered.

### Slice 2 — cart, checkout, notification, schedule

- [x] T7 Add to cart and check subtotal matches PDP price. Route: delegated
      (writer + live site exploration). Commit `50a93a1`.
- [x] T8 Guest checkout with fixed synthetic identifiable data up to the
      payment screen; stop there. Route: delegated (writer + live site
      exploration). Commit `75c1061`.
- [x] T8b Harden the network order guard: cover the real order-placing
      endpoints (REST and GraphQL) observed on the live checkout, and test its
      wiring in the adapter. Route: delegated writer. Commit `15eaa7f`.
- [x] T9 Slack notifier adapter (webhook) with per-step summary, sent on
      every run. Route: delegated writer. Commit `c3ae22b`.
- [ ] T10 `bitbucket-pipelines.yml` custom pipeline + schedule instructions.
- [ ] T11 Heartbeat: alert when the daily run did not happen.

### Later

- [ ] T12 Logged-in test account journey.

## Acceptance criteria

- `pnpm sentinel` walks the journey against production, stops before paying,
  and writes `reporte.json` plus evidence for failing steps.
- A blocked/unseen site produces a run error, never a false site failure.
- `pnpm test` and `pnpm typecheck` pass; tests never touch the network.

## Progress

- 2026-09-30: repo initialized (`d2a27a6`), branch
  `feat/guest-purchase-journey`, feature document created.
- T1 done (scaffold; typecheck passes, 0 tests yet, vitest 5, TypeScript 7, playwright 1.63 installed without browsers).
- T1 commit `d74ced1`.
- T2 commit `1b0f8e6`.
- T2 done: step result model + journey runner, `failureKind` site|unobservable; 9 tests.
- T3 commit `a75d800`.
- T3 done: mulberry32 PRNG, `pickAvailableProduct` (throws `NoAvailableProductError`), `generateSeed`; 10 tests (19 total).
- T4 done: `buildReport` (status ok/degraded/fail/run_error), `Notifier` and `ArtifactStore` ports, `DiskArtifactStore`; 12 tests (31 total). `Browser` port deferred to T5. Commit `82eeea0`.

- `4ecfadf`: `.atl/` (gentle-ai cache) ignored in a
  separate chore commit.
- Review of `d2a27a6..HEAD` (T1–T4): risk medium, consent granted, lens
  reliability, **approved and acknowledged** (lineage
  `review-8dd02694e49bbce7`). Reviewed boundary is now the `.atl` chore
  commit. Non-blocking findings: report status ignores failed steps
  (WARNING), no step timeout, error coercion can throw, `..` prefix false
  reject, `writeJson(undefined)`. The first three became T4b; the last two
  stay as follow-ups.

- T4b done (route: delegated). RED: 6 failing tests (timeout x2, hostile throw, report status x3); GREEN: 36 tests. Timeout = `site` failure (a driven browser that hangs is a site problem; unseen sites are signalled by `UnobservableError`). Report status/failure now derived from steps. Commit `8723600`.

- T5 done (route: delegated). RED: 4 new test files failing on missing modules; GREEN: 52 tests (selector hash guard needed one regex fix, then green). Port `Browser`/`Page` (goto, submit, queryAll, waitFor, screenshot, takeDiagnostics), Playwright adapter with desktop Chrome UA + es-MX, collectors (console errors as metadata only; same-site document/xhr/fetch >= 400 or failed requests degrade the step; third-party counted), screenshot on failed step, trace as run-level evidence (`extraEvidence`). Selectors in `src/site/selectors.ts`. Canonical host observed: `https://chupaprecios.com.mx` (www redirects). Commit `3fdebf2`.

- T6 done (route: delegated). RED: 4 new test files failing on missing modules; GREEN: 120 tests. Steps home, search, pick-product, pdp with sanity classification (blocked/unseen = unobservable), CLI `pnpm sentinel` (exit 0 ok/degraded, 1 site fail, 2 run_error). Live runs against production: OK with seeds 1, 987654, 31337; unreachable host gives run_error exit 2. Availability is not shown on the listing; PDP decides (button enabled after hydration, up to 20s). Commit `c5e619b`.

- T6b commit `273230b`; T6c commit `7e179e6`.

- T7 done (route: delegated writer; trigger: multi-file change + live site exploration). Live probe: clicking "Agregar al carrito" does not open the mini cart; it renders the header counter `[class*="cartTrigger-counter-"]` (absent while empty). `/cart` shows line items and a price summary (Subtotal, shipping $199, Total) for a guest with no postal code or login. Cart name link slug differs from the PDP URL (`acci-n` vs `accin`), so the line is matched by normalized name. Subtotal equals the PDP price to the cent on the live site, so no rounding tolerance (cents comparison only). Port gains `Page.click`; pdp step stores `context.pdp = { title, priceMxn }`. TDD: RED 10 failing tests (with a throwing stub step; 2 new tests passed trivially against the stub), GREEN 137. `pnpm typecheck` clean. Live: `pnpm sentinel` exit 0, all five steps ok, `screenshots/add-to-cart.png` shows `/cart` with the item and matching subtotal (two runs, seeds 449932131 and 1726929204). Commit `50a93a1`. Review: assessed tier medium; RDD disabled (global off), so no native review; writer self-verification plus parent spot check (`pnpm test` 137 passed).

- T8 done (route: delegated writer; trigger: multi-file change + live site exploration). Live probe: `/checkout` is an Amasty one-step checkout ("Compra sin registro", no forced login) with `[data-block]` sections (`shipping_address`, `shipping_method`, `payment_method`, `summary`) that open via `data-expanded="true"`; hidden duplicate fields exist, so selectors are block-scoped and act on the visible match. Address detail fields only appear after picking a Google Places suggestion (`.pac-item`), which needs key-by-key typing; overwriting the autofilled fields by hand left the state as "Aguascalientes", so the profile holds a search query plus the expected postal code (verified in the saved address summary) instead of per-field address data. Shipping method (Estafeta) is preselected; "Siguiente" opens payment methods (PayPal, Kueski, card, deposit, Mercado Pago, OXXO). Safety: the cart button and the place-order button both read "Finalizar compra", so the step opens `/checkout` by URL; `orderPlacingDenylist` in `selectors.ts` + `safeClick` refuse denylisted selectors/keywords and elements whose text reads like ordering/paying (unit tested); the Playwright adapter also aborts GraphQL mutations `placeOrder`/`setPaymentMethodOnCart`/PayPal token. No payment method is ever selected. Synthetic data in `src/site/guest-profile.ts` (Sentinel / QA Monitor, `sentinel-qa@chupaprecios.com.mx`, 5555555555, Paseo de la Reforma 222, 06600 CDMX), each field overridable via `SENTINEL_GUEST_*` (README). Port gains `Page.fill` and `Page.type`; `toCents` and `sameProductName` extracted to `src/site`. TDD: RED 5 test files failing (4 on missing modules incl. `steps.test.ts`, plus 2 failing denylist tests); GREEN 164. `pnpm typecheck` clean. Live: `pnpm sentinel` exit 0 twice (seeds 828951045, 1978131940), all six steps ok, checkout ~20s, `screenshots/checkout.png` shows the payment screen with no method selected and the order not placed; no blocked or failed same-site requests. Commit `75c1061`.
- T8b done (route: delegated writer; trigger: multi-file change + live endpoint exploration). The checkout is the PWA Studio app with Amasty's one-step checkout, not classic Luma: walking the journey to the payment screen with every request recorded (and an extra probe-only abort guard, which blocked nothing) showed no REST call at all; the journey uses GraphQL only (`createCart`, `AddProductToCart`, `generateMagentoSku`, `setGuestEmailOnCheckout`, `SetShippingAddress`, `SetShippingAddressForEstimate`, `SetShippingMethod` mutations, queries via GET) plus `POST /api/v1/search|product|product/variants/`; PayPal's SDK posts `/v1/oauth2/token` on its own when the payment screen loads. Confirmed statically in the storefront bundles (GET only, nothing clicked): GraphQL fields `placeOrder` (also used by Kueski), `setPaymentMethodOnCart` (operation `setSelectedPaymentMethod` too), `processMercadoPagoPaymentCallback`, `createMercadoPagoCheckoutProPreference`, `createPaymentIntent`, `createVaultPaymentIntent`, `createPaypalExpressToken`, `addStripePaymentMethod`, `tokenizeCreditCard`, Venmo contexts; REST `POST /rest/V1/guest-carts/<id>/payment-information` and `/rest/V1/carts/mine/payment-information` (legacy PWA place-order thunk). Inferred and covered anyway: `/rest/<store>/V1` prefix, `set-payment-information`, `selected-payment-method`, `PUT .../order`, any `place-order` path, PayPal `/v2/checkout/orders`, `setPaymentMethodAndPlaceOrder`, `createBraintreeClientToken`. Guard: `orderPlacingReason`/`mayPlaceOrder` in `src/site/order-guard.ts` (GraphQL by mutation field in body or GET query; REST by non-GET method + path); `installOrderGuard` in the adapter routes only matching URLs, aborts and reports, otherwise `route.fallback()`. Blocked requests surface through `Page.takeBlockedOrderRequests`; `instrumentStep` then throws `OrderPlacementBlockedError`, a subclass of `UnobservableError`, so the run is a run error (exit 2): a blocked order request is a monitor bug, never a site failure, and the runner needs no change. Wiring test drives real Chromium against a fake shop served only by Playwright routes (no network). TDD: RED 8 failing tests plus the wiring suite failing in setup (4 new allow-path tests passed trivially against the old guard); GREEN 175. `pnpm typecheck` clean. Live: `pnpm sentinel` exit 0, all six steps ok, no same-site failed requests, nothing blocked, no order placed (run `20261005T184828Z`, seed 441283603). Follow-up: a `safeClick` refusal is still a plain Error (site failure). Commit `15eaa7f`.

- T9 done (route: delegated writer; trigger: multi-file change). User decision: notify on every run (ok, degraded, fail, run_error), not only failures. `formatSlackMessage` (`src/adapters/slack-message.ts`) is a pure Block Kit renderer with a plain `text` fallback: header with status emoji and label, fields (target, run id, start UTC, duration, seed, product from the `pdp` metadata, else the `pick-product` pick), one line per step with status and duration, a section per failing/degraded step with its error and failure kind (site vs unobservable), and a context line with the evidence paths (`<out>/reporte.json`, `screenshots/`, `trace.zip`; no uploads). Site text is escaped (`&<>`) and truncated without splitting entities (sections <= 3000, header <= 150, fields <= 2000, each error <= 1200). `SlackWebhookNotifier` implements the `Notifier` port with an injectable `fetch` and a 10s `AbortSignal.timeout`; non-2xx, network errors and timeouts reject with the webhook URL redacted. `notifyRun` (`src/cli/notify.ts`) runs after the report is written and the summary printed: unset/blank `SLACK_WEBHOOK_URL` logs one skip line; failures go to stderr and never throw, so the report and exit code are unchanged. TDD: RED 3 new test files failing on missing modules (20 tests); GREEN 195. `pnpm typecheck` clean. HTTP path checked against a localhost `node:http` server (200 sent, 400 logged as `HTTP 400: invalid_payload`, closed server logged as a network failure; URL never printed). Live: `pnpm sentinel` without `SLACK_WEBHOOK_URL` exit 0, all six steps ok, skip line printed (run `20261005T191754Z`). No real Slack webhook was used. Commit `c3ae22b`. Review: RDD state not assessed by the writer (parent owns it).
- Follow-ups (not implemented): a `safeClick` refusal is a plain Error, so it is reported as a site failure; it should be a run error. The order-guard wiring test (`tests/adapters/order-guard-wiring.test.ts`) needs Chromium installed in CI (T10).

- T9 verification: assessed tier high; RDD disabled (global off), so an independent read-only verifier ran: PASS on exit-code invariance, skip when unset, 10s timeout, Slack limits and offline tests; one narrow defect: a non-2xx body was truncated before redaction, so an echoed webhook URL cut at 200 chars leaked partially. Fixed inline (route: inline, one file + its test): redact before truncating. TDD: RED 1 failing test, GREEN 196; typecheck clean. Follow-up (not implemented): a browser launch failure returns exit 2 before a report exists, so it is not notified to Slack.

- T10 in progress (route: delegated writer; trigger: multi-file change + external docs). CI unit done, commit `7605fd6`: `bitbucket-pipelines.yml` on `mcr.microsoft.com/playwright:v1.63.0-noble` (exact installed Playwright; its Dockerfile at tag v1.63.0 installs Node 24 from NodeSource and bakes Chromium under `/ms-playwright`), pnpm 12.4.1 via `corepack install --global` (a `packageManager` field was rejected: pnpm 12 then rewrites `pnpm-lock.yaml` with a `packageManagerDependencies` document), `--frozen-lockfile`, custom `pnpm` cache on `.pnpm-store`, `pnpm exec playwright install chromium` as a no-op guard; `default` runs typecheck + test on every push; `custom: sentinel-daily` runs `pnpm sentinel` with artifacts `runs/**` and `capture-on: always` (Bitbucket's default is upload on success only). README "Scheduling in Bitbucket": UI schedule daily 12:00 UTC on `main` (Mexico City is UTC-6 all year since the 2022 DST abolition, checked with tzdata), secured `SLACK_WEBHOOK_URL`, manual run, 14-day artifact retention, exit-code colours. Checks: YAML parses (PyYAML); validates against Atlassian's published pipelines JSON schema except the named-artifact form, which that schema predates (validated with the flat `runs/**` form; the named form with `capture-on` matches the current Atlassian docs). Docker not available locally, so the image was not run. Slack CI link: RED 3 failing tests + 1 file on a missing module; pure `ciEvidenceLink` (`src/cli/ci-evidence-link.ts`) and the `evidenceLink` message option are green; wiring is blocked: it needs `src/adapters/slack-webhook-notifier.ts`, outside the authorized edit surfaces (2 tests still RED, uncommitted).

## Next step

T10: `bitbucket-pipelines.yml` custom pipeline + schedule instructions
(install Chromium in CI for the order-guard wiring test; provide
`SLACK_WEBHOOK_URL` as a secured repository variable).
