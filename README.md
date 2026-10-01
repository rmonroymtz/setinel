# Sentinel

Synthetic monitor that walks chupaprecios.com.mx like a guest shopper, stops
before payment, writes a machine-readable `reporte.json` and (later) notifies
Slack. Failure detection is deterministic; there is no AI in this tool.

Status: the journey is in progress. `pnpm sentinel` is currently a stub.

## Requirements

Node >= 24 (TypeScript runs through native type stripping) and pnpm.

## Development

```
pnpm install
pnpm test        # vitest, never touches the network
pnpm typecheck   # tsc --noEmit
```
