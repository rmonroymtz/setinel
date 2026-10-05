# Sentinel

Synthetic monitor that walks chupaprecios.com.mx like a guest shopper, stops
before payment, writes a machine-readable `reporte.json` and notifies
Slack. Failure detection is deterministic; there is no AI in this tool.

Status: the journey covers home, search, a seeded random product pick, the
product page, a guest cart and guest checkout up to the payment screen, and a
Slack notification. Scheduling is still to come.

## Requirements

Node >= 24 (TypeScript runs through native type stripping) and pnpm.

## Running

```
pnpm install
pnpm exec playwright install chromium   # once
pnpm sentinel                           # headless run against production
pnpm sentinel --seed 42 --term taladro --headed
```

| Flag | Env | Default |
| --- | --- | --- |
| `--url <url>` | `SENTINEL_URL` | `https://chupaprecios.com.mx` (canonical host; `www` redirects) |
| `--term <text>` | `SENTINEL_TERM` | `licuadora` |
| `--seed <int>` | `SENTINEL_SEED` | random; the same seed picks the same product from the same results |
| `--out <dir>` | `SENTINEL_OUT` | `runs/<runId>/` |
| `--headed` | `SENTINEL_HEADED=1` | headless |

The checkout uses a fixed synthetic guest (`src/site/guest-profile.ts`). Each
field can be overridden; blank values keep the default:

| Env | Default |
| --- | --- |
| `SENTINEL_GUEST_EMAIL` | `sentinel-qa@chupaprecios.com.mx` |
| `SENTINEL_GUEST_FIRST_NAME` | `Sentinel` (the site allows 20 characters) |
| `SENTINEL_GUEST_LAST_NAME` | `QA Monitor` (20 characters max) |
| `SENTINEL_GUEST_PHONE` | `5555555555` (10 digits) |
| `SENTINEL_GUEST_ADDRESS` | `Avenida Paseo de la Reforma 222, Juárez, 06600 Ciudad de México` (typed into the address search; the first suggestion is picked) |
| `SENTINEL_GUEST_POSTAL_CODE` | `06600` (must appear in the saved address) |
| `SENTINEL_GUEST_REFERENCES` | `Sentinel QA synthetic monitor, not a real order` |

Flags win over environment variables. A run writes to its output directory:
`reporte.json`, `trace.zip` (Playwright trace of the whole run) and
`screenshots/<step>.png` for every step, taken as the step left the page. Paths inside the report are
relative to that directory. One summary line is printed.

Exit codes: `0` ok or degraded, `1` the site is broken (a step failed), `2` run
error (the site could not be observed: blocked, 403, empty page, network
failure; or the tool itself failed). A run error is never reported as a site
failure.

### What the steps check

1. `home`: status below 400 and a rendered page with a search box. A 401/403/429,
   a "Forbidden"/"Just a moment" title, an empty shell or a network error is a
   run error.
2. `search`: the term returns product cards.
3. `pick-product`: the seeded PRNG picks one card. The listing does not show stock,
   so every card is a candidate.
4. `pdp`: title, MXN price, main image decoded, and an enabled "Agregar al
   carrito" button (not clicked here). If the button stays disabled and the page
   says sold out, the next candidate is tried (at most 3 attempts); disabled
   with no explanation is a site failure.
5. `add-to-cart`: clicks "Agregar al carrito", waits for the header cart counter,
   opens `/cart` and checks that the product from the product page is a line
   item and that the cart subtotal equals the product page price to the cent.
   A missing counter, line item or subtotal, or a different subtotal, is a site
   failure; a blocked cart page is a run error.
6. `checkout`: opens `/checkout` as a guest (no login), fills the synthetic
   contact data, types the address into the address search (Google Places) and
   picks the first suggestion, which fills street, postal code, colonia and
   state. It saves the address (the saved address must show the guest postal
   code), confirms the preselected shipping method and waits for the payment
   screen: the payment method options next to an order summary that lists the
   product with a subtotal equal to the product page price to the cent. A
   missing guest form, suggestion, section, payment method, product or subtotal
   is a site failure; a blocked checkout page is a run error.

**The journey never places an order.** It stops on the payment screen without
choosing a payment method. Two independent guards enforce it: every checkout
click goes through `safeClick` (`src/steps/safe-click.ts`), which refuses any
selector or element on the order-placing denylist in `src/site/selectors.ts`
("Finalizar compra", "Pagar", PayPal, the payment section, ...), and the
browser aborts any request that would place an order or set a payment method:
GraphQL mutations such as `placeOrder` or `setPaymentMethodOnCart`, and REST
writes such as `POST /rest/V1/guest-carts/<id>/payment-information` (patterns
in `src/site/order-guard.ts`). If that network guard ever blocks a request, the
monitor itself tried to buy: the run ends as a run error (exit code 2), never as
a site failure. The cart's checkout button also reads "Finalizar compra", so the
journey opens `/checkout` by URL instead of clicking it.

### Slack notification

Set `SLACK_WEBHOOK_URL` to a Slack [incoming webhook](https://api.slack.com/messaging/webhooks)
URL and every run (ok, degraded, fail and run error) posts one message after
`reporte.json` is written. Without it, the run prints
`sentinel: SLACK_WEBHOOK_URL is not set; Slack notification skipped` and
nothing is sent. The webhook URL is a secret: it is never printed or logged.

The message shows:

- the overall status with an emoji and a label (`OK`, `DEGRADED`, `FAIL`: the
  site is broken, `RUN ERROR`: the site could not be observed);
- target URL, run id, start time (UTC), duration, seed and the product the
  product page opened (linked, with its price);
- one line per step with its status and duration;
- for a failing step its error message and failure kind (site failure or
  unobservable), and for a degraded step its error message; long messages are
  truncated to stay within Slack's block limits;
- where the evidence lives: `<out>/reporte.json`, `<out>/screenshots/` and
  `<out>/trace.zip`. Webhooks cannot attach files, so nothing is uploaded.

A Slack problem (HTTP error, network error, no answer within 10 seconds) is
printed to stderr and never changes the report or the exit code.

Console errors are recorded in step metadata only. Failed same-site
document/xhr/fetch requests (HTTP >= 400 or network failure) degrade the step;
third-party failures are only counted.

Selectors live in `src/site/selectors.ts` (class names carry a build hash, so
they are anchored by prefix, role or text). The browser presents a real desktop
Chrome user agent because the site blocks Playwright's default one.

## Development

```
pnpm install
pnpm test        # vitest, never touches the network
pnpm typecheck   # tsc --noEmit
```
