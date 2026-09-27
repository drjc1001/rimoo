import { runAnalyze } from './analyze.ts';
import { DEFAULT_CHUNK_SIZE, isDate } from './chunks.ts';
import { DEFAULT_SIMILARITY } from './repeated.ts';
import { MAX_CONCURRENCY } from './runner.ts';

export const HELP = `rimoo — Remember how you work.

Usage:
  rimoo analyze [options]

Options:
  --history <path>   history.jsonl to read (default: ~/.claude/history.jsonl)
  --out <dir>        where to write results (default: ./rimoo-out)
  --similarity <0-1> how alike two instructions must be to count as one (default: ${DEFAULT_SIMILARITY})
  --project <text>   only analyze projects whose path contains this text
  --since <date>     only analyze prompts from this date on, YYYY-MM-DD
  --sample <n>       only the first n chunks, for a quick trial run
  --chunk-size <n>   prompts per chunk (default: ${DEFAULT_CHUNK_SIZE.toLocaleString('en-US')})
  --prepare-only     stop after writing the prompts; do not run Claude Code
  --yes              run Claude Code without asking first
  --concurrency <n>  chunks to analyze at once, 1 to ${MAX_CONCURRENCY} (default: 1)
  --force            analyze chunks and merge again even if already done
  --model <name>     model for Claude Code to use, passed to claude --model as is
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
  const takesValue = new Set([
    'history',
    'out',
    'similarity',
    'project',
    'since',
    'sample',
    'chunk-size',
    'concurrency',
    'model',
  ]);
  const flags = new Set(['prepare-only', 'yes', 'force']);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '-h' || arg === '--help') {
      out.options.help = true;
    } else if (arg.startsWith('--')) {
      const eq = arg.indexOf('=');
      const key = eq === -1 ? arg.slice(2) : arg.slice(2, eq);
      if (flags.has(key)) {
        if (eq === -1) out.options[key] = true;
        else out.errors.push(`Option --${key} takes no value`);
        continue;
      }
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
  /** Where the y/N answer comes from; without it analyze stops after preparing the prompts. */
  stdin?: (NodeJS.ReadableStream & { isTTY?: boolean }) | undefined;
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
  let similarity: number | undefined;
  if (typeof options.similarity === 'string') {
    similarity = Number(options.similarity);
    if (options.similarity.trim() === '' || !Number.isFinite(similarity) || similarity < 0 || similarity > 1) {
      errors.push(`Option --similarity must be a number from 0 to 1, got: ${options.similarity}`);
    }
  }
  const positive = (key: 'sample' | 'chunk-size'): number | undefined => {
    const raw = options[key];
    if (typeof raw !== 'string') return undefined;
    if (!/^\d+$/.test(raw.trim()) || Number(raw) < 1) {
      errors.push(`Option --${key} must be a whole number of 1 or more, got: ${raw}`);
      return undefined;
    }
    return Number(raw);
  };
  const sample = positive('sample');
  const chunkSize = positive('chunk-size');
  let concurrency: number | undefined;
  if (typeof options.concurrency === 'string') {
    const raw = options.concurrency;
    concurrency = Number(raw);
    if (!/^\d+$/.test(raw.trim()) || concurrency < 1 || concurrency > MAX_CONCURRENCY) {
      errors.push(`Option --concurrency must be a whole number from 1 to ${MAX_CONCURRENCY}, got: ${raw}`);
    }
  }
  if (typeof options.since === 'string' && !isDate(options.since)) {
    errors.push(`Option --since must be a date written YYYY-MM-DD, got: ${options.since}`);
  }
  if (errors.length > 0) {
    io.stderr(errors.join('\n') + '\n\n' + HELP);
    return 2;
  }
  const str = (v: string | true | undefined): string | undefined => (typeof v === 'string' ? v : undefined);
  return runAnalyze({
    historyPath: str(options.history),
    outDir: str(options.out),
    similarity,
    chunkSize,
    project: str(options.project),
    since: str(options.since),
    sample,
    prepareOnly: options['prepare-only'] === true,
    yes: options.yes === true,
    concurrency,
    force: options.force === true,
    model: str(options.model),
    stdin: io.stdin,
    env: io.env,
    cwd: io.cwd,
    stdout: io.stdout,
    stderr: io.stderr,
  });
}
