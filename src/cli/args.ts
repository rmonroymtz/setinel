import { parseArgs } from "node:util";

export const DEFAULT_URL = "https://chupaprecios.com.mx";
// Broad term that returns a full page of products on production.
export const DEFAULT_TERM = "licuadora";

export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}

export interface CliOptions {
  help: boolean;
  baseUrl: string;
  searchTerm: string;
  seed?: number;
  outDir?: string;
  headed: boolean;
}

export const USAGE = `Usage: pnpm sentinel [options]

  --url <url>     Site to monitor (env SENTINEL_URL, default ${DEFAULT_URL})
  --term <text>   Search term (env SENTINEL_TERM, default "${DEFAULT_TERM}")
  --seed <int>    Seed for the random product pick, 0..4294967295 (env SENTINEL_SEED, default random)
  --out <dir>     Output directory (env SENTINEL_OUT, default runs/<runId>)
  --headed        Show the browser (env SENTINEL_HEADED=1)
  --help          Show this help

Exit codes: 0 ok or degraded, 1 site failure, 2 run error (site could not be observed, or the tool failed).`;

/** Flags win over environment variables, which win over defaults. */
export function parseCliArgs(argv: string[], env: Record<string, string | undefined>): CliOptions {
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      strict: true,
      options: {
        url: { type: "string" },
        term: { type: "string" },
        seed: { type: "string" },
        out: { type: "string" },
        headed: { type: "boolean" },
        help: { type: "boolean" },
      },
    }));
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message : String(error));
  }

  const searchTerm = (values.term ?? env.SENTINEL_TERM ?? DEFAULT_TERM).trim();
  if (!searchTerm) throw new UsageError("The search term must not be empty");

  const seedText = values.seed ?? env.SENTINEL_SEED;
  const outDir = values.out ?? env.SENTINEL_OUT;
  return {
    help: values.help ?? false,
    baseUrl: parseBaseUrl(values.url ?? env.SENTINEL_URL ?? DEFAULT_URL),
    searchTerm,
    ...(seedText !== undefined && { seed: parseSeed(seedText) }),
    ...(outDir && { outDir }),
    headed: values.headed ?? isTruthy(env.SENTINEL_HEADED),
  };
}

function parseBaseUrl(text: string): string {
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new UsageError(`Invalid URL: ${text}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new UsageError(`The URL must be http(s): ${text}`);
  return text.replace(/\/+$/, "");
}

function parseSeed(text: string): number {
  const seed = Number(text);
  if (!/^\d+$/.test(text.trim()) || !Number.isSafeInteger(seed) || seed >= 2 ** 32) {
    throw new UsageError(`The seed must be an integer between 0 and 4294967295, got "${text}"`);
  }
  return seed;
}

function isTruthy(value: string | undefined): boolean {
  return value !== undefined && ["1", "true", "yes"].includes(value.toLowerCase());
}
