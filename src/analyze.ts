import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { locateHistory, parseHistory } from './history.ts';
import { computeStats } from './stats.ts';
import { formatRepeated, formatSaved, formatSummary, n } from './format.ts';
import { DEFAULT_SIMILARITY, forExport, groupRepeated } from './repeated.ts';

export interface AnalyzeOptions {
  historyPath?: string | undefined;
  outDir?: string | undefined;
  /** Trigram Jaccard threshold for folding near-identical instructions, 0 to 1. */
  similarity?: number | undefined;
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

/** Runs `rimoo analyze`. Returns the process exit code. */
export async function runAnalyze(opts: AnalyzeOptions): Promise<number> {
  const env = opts.env ?? process.env;
  const cwd = opts.cwd ?? process.cwd();
  const historyPath = locateHistory({ override: opts.historyPath, env });

  try {
    const info = await stat(historyPath);
    if (!info.isFile()) throw new Error('not a file');
  } catch {
    opts.stderr(
      [
        `No Claude Code history found at ${historyPath}`,
        'Rimoo reads the history.jsonl that Claude Code writes under ~/.claude',
        '(or under $CLAUDE_CONFIG_DIR when that is set).',
        'Use --history <path> to point at a different file.',
        '',
      ].join('\n'),
    );
    return 1;
  }

  const parsed = await parseHistory(historyPath);
  if (parsed.prompts.length === 0) {
    opts.stderr(
      `${historyPath} has ${n(parsed.totalLines)} lines but none could be read as a prompt ` +
        `(${n(parsed.badLines.length)} unreadable). Nothing to analyze.\n`,
    );
    return 1;
  }

  const stats = computeStats(parsed, historyPath);
  const similarity = opts.similarity ?? DEFAULT_SIMILARITY;
  const repeated = groupRepeated(parsed.prompts, { similarity });
  const outDir = path.resolve(cwd, opts.outDir ?? 'rimoo-out');
  await mkdir(outDir, { recursive: true });
  const outFile = path.join(outDir, 'stats.json');
  await writeFile(outFile, JSON.stringify(stats, null, 2) + '\n', 'utf8');
  const repeatedFile = path.join(outDir, 'repeated.json');
  await writeFile(
    repeatedFile,
    JSON.stringify({ generatedAt: stats.generatedAt, similarity, ...forExport(repeated) }, null, 2) + '\n',
    'utf8',
  );

  const display = (file: string): string => {
    const rel = path.relative(cwd, file);
    return rel === '' || rel.startsWith('..') || path.isAbsolute(rel) ? file : rel;
  };
  opts.stdout(formatSummary(stats) + formatRepeated(repeated) + formatSaved([display(outFile), display(repeatedFile)]));
  if (parsed.badLines.length > 0) {
    const shown = parsed.badLines.slice(0, 5).join(', ');
    const more = parsed.badLines.length > 5 ? `, … (${n(parsed.badLines.length)} total)` : '';
    opts.stderr(`Warning: skipped ${n(parsed.badLines.length)} unreadable line(s): ${shown}${more}\n`);
  }
  return 0;
}
