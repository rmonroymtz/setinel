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

- [ ] T7 Add to cart and check subtotal matches PDP price.
- [ ] T8 Guest checkout with fixed synthetic identifiable data up to the
      payment screen; stop there.
- [ ] T9 Slack notifier adapter (webhook) with per-step summary.
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

## Next step

T7: add to cart and compare the subtotal with the PDP price.
