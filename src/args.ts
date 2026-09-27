import { runAnalyze } from './analyze.ts';

export const HELP = `rimoo — Remember how you work.

Usage:
  rimoo analyze [options]

Options:
  --history <path>   history.jsonl to read (default: ~/.claude/history.jsonl)
  --out <dir>        where to write results (default: ./rimoo-out)
  -h, --help         show this help
`;

export interface ParsedArgs {
  command?: string;
  options: Record<string, string | true>;
  errors: string[];
}

/** Tiny argv parser: one positional command, `--key value`, `--key=value`, `-h`. */
export function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = { options: {}, errors: [] };
  const takesValue = new Set(['history', 'out']);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '-h' || arg === '--help') {
      out.options.help = true;
    } else if (arg.startsWith('--')) {
      const eq = arg.indexOf('=');
      const key = eq === -1 ? arg.slice(2) : arg.slice(2, eq);
      if (!takesValue.has(key)) {
        out.errors.push(`Unknown option: --${key}`);
        continue;
      }
      const value = eq === -1 ? argv[++i] : arg.slice(eq + 1);
      if (value === undefined || value === '') out.errors.push(`Option --${key} needs a value`);
      else out.options[key] = value;
    } else if (arg.startsWith('-')) {
      out.errors.push(`Unknown option: ${arg}`);
    } else if (out.command === undefined) {
      out.command = arg;
    } else {
      out.errors.push(`Unexpected argument: ${arg}`);
    }
  }
  return out;
}

export interface Io {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  env?: NodeJS.ProcessEnv;
  cwd?: string;
}

/** Entry used by the bin. Returns the process exit code. */
export async function main(argv: string[], io: Io): Promise<number> {
  const { command, options, errors } = parseArgs(argv);
  if (options.help || command === undefined) {
    io.stdout(HELP);
    return options.help ? 0 : 2;
  }
  if (command !== 'analyze') errors.unshift(`Unknown command: ${command}`);
  if (errors.length > 0) {
    io.stderr(errors.join('\n') + '\n\n' + HELP);
    return 2;
  }
  const str = (v: string | true | undefined): string | undefined => (typeof v === 'string' ? v : undefined);
  return runAnalyze({
    historyPath: str(options.history),
    outDir: str(options.out),
    env: io.env,
    cwd: io.cwd,
    stdout: io.stdout,
    stderr: io.stderr,
  });
}
