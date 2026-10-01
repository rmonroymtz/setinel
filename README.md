# Sentinel

Synthetic monitor that walks chupaprecios.com.mx like a guest shopper, stops
before payment, writes a machine-readable `reporte.json` and (later) notifies
Slack. Failure detection is deterministic; there is no AI in this tool.

Status: the journey currently covers home, search, a seeded random product pick and
the product page. Cart, checkout, Slack and scheduling are still to come.

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

Flags win over environment variables. A run writes to its output directory:
`reporte.json`, `trace.zip` (Playwright trace of the whole run) and
`screenshots/<step>.png` for each failed step. Paths inside the report are
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
   carrito" button (never clicked). If the button stays disabled and the page
   says sold out, the next candidate is tried (at most 3 attempts); disabled
   with no explanation is a site failure.

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
