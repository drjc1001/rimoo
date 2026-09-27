#!/usr/bin/env node
import { main } from './args.ts';

main(process.argv.slice(2), {
  stdout: (t) => process.stdout.write(t),
  stderr: (t) => process.stderr.write(t),
  stdin: process.stdin,
}).then(
  (code) => process.exit(code),
  (err: unknown) => {
    process.stderr.write(`rimoo failed: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  },
);
