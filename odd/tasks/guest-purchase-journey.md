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
- [ ] T3 Seeded random selection of an available product (deterministic
      PRNG, filters out-of-stock, empty list is a failure). Route: delegated.
- [ ] T4 Report contract: `reporte.json` builder (run id, timestamps, seed,
      target URL, overall status, per-step results, evidence paths) and a
      disk `ArtifactStore`. Route: delegated.
- [ ] T5 Playwright adapter: context with real user agent, console and
      failed-request collectors, screenshot and trace on failure, selectors
      module mapped against the live site. Route: delegated (writer + live
      site exploration).
- [ ] T6 Steps home, search, pick product, PDP checks (price, image, stock,
      enabled add-to-cart), sanity check for blocked/unseen pages, CLI
      `pnpm sentinel`. Route: delegated.

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
- T2 done: step result model + journey runner, `failureKind` site|unobservable; 9 tests.

## Next step

T1–T4 (pure domain, no network) in one delegated writer.
