import { runAnalyze } from './analyze.ts';
import { DEFAULT_CHUNK_SIZE, isDate } from './chunks.ts';
import { DEFAULT_SIMILARITY } from './repeated.ts';
import { MAX_CONCURRENCY } from './runner.ts';
import { parseCardSize, type CardSize } from './card.ts';
import { SKILL_NAME } from './install.ts';

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
  --remerge          merge the findings into rules again (for example after an update), without analyzing the chunks again
  --model <name>     model for Claude Code to use, passed to claude --model as is
  --with-transcripts give short prompts Claude's previous message, read from the session
                     transcripts next to the history (more to analyze, so it costs more)
  --allow-paths      keep file paths and project names in CLAUDE.md, SKILL.md, rules.md, workstyle.json and the share files
  --lang en          share.txt and the share card in English (translates the top titles once with Claude Code)
  --card-size <WxH>  share card size, e.g. 1200x627 (default: 1080x1080)
  --install-skill    add SKILL.md and rules.md to Claude Code as /my-workstyle without asking
  --skill-name <name>
                     install the skill under this name instead (a-z, 0-9 and -)
  --force-skill      replace an installed skill of the same name that has different rules
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
    'lang',
    'card-size',
    'skill-name',
  ]);
  const flags = new Set(['prepare-only', 'yes', 'force', 'remerge', 'allow-paths', 'with-transcripts', 'install-skill', 'force-skill']);
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
  if (typeof options.lang === 'string' && options.lang !== 'en') {
    errors.push(`Option --lang only takes en, got: ${options.lang}`);
  }
  let cardSize: CardSize | undefined;
  if (typeof options['card-size'] === 'string') {
    cardSize = parseCardSize(options['card-size']) ?? undefined;
    if (cardSize === undefined) {
      errors.push(`Option --card-size must be width x height in pixels, e.g. 1200x627, got: ${options['card-size']}`);
    }
  }
  if (typeof options['skill-name'] === 'string' && !SKILL_NAME.test(options['skill-name'])) {
    errors.push(
      `Option --skill-name takes lowercase letters, digits and -, starting with a letter or digit, got: ${options['skill-name']}`,
    );
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
    remerge: options.remerge === true,
    model: str(options.model),
    allowPaths: options['allow-paths'] === true,
    withTranscripts: options['with-transcripts'] === true,
    lang: options.lang === 'en' ? 'en' : undefined,
    cardSize,
    installSkill: options['install-skill'] === true,
    skillName: str(options['skill-name']),
    forceSkill: options['force-skill'] === true,
    stdin: io.stdin,
    env: io.env,
    cwd: io.cwd,
    stdout: io.stdout,
    stderr: io.stderr,
  });
}
