import { main } from "../src/cli/main.ts";

main(process.argv.slice(2), process.env).then(
  (code) => {
    process.exitCode = code;
  },
  (error) => {
    console.error(`sentinel: unexpected error: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
    process.exitCode = 2;
  },
);
