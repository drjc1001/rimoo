import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { locateHistory, parseHistory } from './history.ts';
import { computeStats } from './stats.ts';
import { DEFAULT_CHUNK_SIZE, prepareChunks, writeChunks, type ManifestChunk } from './chunks.ts';
import { createInterface } from 'node:readline';
import {
  formatLargeHistory,
  formatMergePlan,
  formatMergeProgress,
  formatMergeTotal,
  formatPrepared,
  formatProgress,
  formatRepeated,
  formatRunPlan,
  formatRunTotal,
  formatSaved,
  formatSummary,
  n,
} from './format.ts';
import { findClaude, finishedChunk, runAll } from './runner.ts';
import { estimateChunkTokens } from './tokens.ts';
import { DEFAULT_SIMILARITY, forExport, groupRepeated } from './repeated.ts';
import { planMerge, runMerge, type Merged } from './merge.ts';
import { formatGate, formatTopRules, writeExports, type ExportFile } from './exports.ts';
import { projectNames, type Hit } from './privacy.ts';
import { attachTranscripts, loadTranscripts, transcriptsDir } from './transcripts.ts';
import { DEFAULT_CARD_SIZE, findChrome, screenshotCard, type CardSize } from './card.ts';
import { needsTranslation, translateTitles } from './translate-template.ts';

export interface AnalyzeOptions {
  historyPath?: string | undefined;
  outDir?: string | undefined;
  /** Trigram Jaccard threshold for folding near-identical instructions, 0 to 1. */
  similarity?: number | undefined;
  /** Prompts per chunk for the language-model pass. */
  chunkSize?: number | undefined;
  /** Only chunk prompts whose project path contains this. */
  project?: string | undefined;
  /** Only chunk prompts on or after this local date, YYYY-MM-DD. */
  since?: string | undefined;
  /** Write only the first n chunks. */
  sample?: number | undefined;
  /** Stop after writing chunks and prompts; do not run Claude Code. */
  prepareOnly?: boolean | undefined;
  /** Run without asking first. */
  yes?: boolean | undefined;
  /** Chunks analyzed at once, 1 to 4. */
  concurrency?: number | undefined;
  /** Analyze chunks and merge again even if already done. */
  force?: boolean | undefined;
  /** Passed to `claude --model` as is. */
  model?: string | undefined;
  /** Give short prompts Claude's previous message, read from the session transcripts next to the history. */
  withTranscripts?: boolean | undefined;
  /** Keep file paths in CLAUDE.md, SKILL.md, workstyle.json, share.txt and share.html. */
  allowPaths?: boolean | undefined;
  /** 'en': share.txt and the share card in English, translating the top titles once with Claude Code. */
  lang?: 'en' | undefined;
  /** share.html and share.png size (default 1080×1080). */
  cardSize?: CardSize | undefined;
  /**
   * Where the y/N answer is read from. Without it (a caller that wired no input) analyze stops after
   * preparing, as with prepareOnly.
   */
  stdin?: (NodeJS.ReadableStream & { isTTY?: boolean }) | undefined;
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

  let transcripts: Map<number, string | undefined> | undefined;
  let sessionFiles: { files: number; opened: number } | undefined;
  const sessionDir = transcriptsDir(historyPath);
  if (opts.withTranscripts) {
    const loaded = await loadTranscripts({ dir: sessionDir, sessionIds: parsed.prompts.map((p) => p.sessionId) });
    transcripts = attachTranscripts(parsed.prompts, loaded);
    sessionFiles = { files: loaded.files, opened: loaded.opened };
  }
  const chunkOpts = {
    chunkSize: opts.chunkSize ?? DEFAULT_CHUNK_SIZE,
    project: opts.project,
    since: opts.since,
    sample: opts.sample,
    transcripts,
  };
  const manifest = await writeChunks(
    outDir,
    prepareChunks(parsed.prompts, chunkOpts),
    chunkOpts,
    undefined,
    sessionFiles,
  );
  const manifestFile = path.join(outDir, 'manifest.json');

  const display = (file: string): string => {
    const rel = path.relative(cwd, file);
    return rel === '' || rel.startsWith('..') || path.isAbsolute(rel) ? file : rel;
  };
  opts.stdout(
    formatSummary(stats) +
      formatRepeated(repeated) +
      formatPrepared(manifest, display(path.join(outDir, 'prompts')), display(sessionDir)) +
      formatLargeHistory(manifest),
  );
  const saved = [display(outFile), display(repeatedFile), display(manifestFile)];
  const code = await analyzeChunks();
  opts.stdout(formatSaved(saved));
  if (parsed.badLines.length > 0) {
    const shown = parsed.badLines.slice(0, 5).join(', ');
    const more = parsed.badLines.length > 5 ? `, … (${n(parsed.badLines.length)} total)` : '';
    opts.stderr(`Warning: skipped ${n(parsed.badLines.length)} unreadable line(s): ${shown}${more}\n`);
  }
  return code;

  /** The language-model pass. Returns the exit code; adds findings/ to `saved` when it ran. */
  async function analyzeChunks(): Promise<number> {
    if (opts.prepareOnly || manifest.chunks.length === 0 || opts.stdin === undefined) return 0;
    const promptDir = display(path.join(outDir, 'prompts'));
    const claude = await findClaude(env);
    if (claude === null) {
      opts.stdout(
        'Claude Code (the `claude` command) was not found on PATH, so nothing was analyzed.\n' +
          `  The prompts in ${promptDir}/ are ready to paste into Claude yourself, one chunk at a time.\n\n`,
      );
      return 0;
    }
    let approved = opts.yes === true;
    const toRun: ManifestChunk[] = [];
    for (const c of manifest.chunks) if (opts.force || (await finishedChunk(outDir, c)) === null) toRun.push(c);
    const kept = manifest.chunks.length - toRun.length;
    const estimateOf = (cs: typeof toRun): number => cs.reduce((a, c) => a + estimateChunkTokens(c.tokens), 0);
    if (toRun.length === 0) {
      opts.stdout(`All ${n(kept)} chunks already have findings; pass --force to analyze them again.\n`);
    } else {
      opts.stdout(formatRunPlan(toRun, kept, estimateOf(toRun)));
      if (!opts.yes) {
        if (!opts.stdin!.isTTY) {
          opts.stderr('Not running: there is no terminal to ask for a yes. Pass --yes to run.\n');
          return 2;
        }
        const question = `Run ${toRun.length === 1 ? '1 chunk' : `${n(toRun.length)} chunks`} now? [y/N] `;
        if (!(await confirm(opts.stdin!, opts.stdout, question))) {
          opts.stdout('Nothing was sent to Claude.\n\n');
          return 0;
        }
        approved = true;
      }
    }
    const findingsDir = display(path.join(outDir, 'findings'));
    const summary = await runAll({
      claude,
      outDir,
      manifest,
      concurrency: opts.concurrency,
      force: opts.force,
      model: opts.model,
      env,
      onProgress: (p) => opts.stdout(formatProgress(p)),
    });
    const failed = new Set(summary.chunksFailed);
    const finishedChunks: ManifestChunk[] = [];
    for (const c of manifest.chunks) if (!failed.has(c.index) && (await finishedChunk(outDir, c))) finishedChunks.push(c);
    opts.stdout(formatRunTotal({ summary, manifest, findingsDir, estimateFinished: estimateOf(finishedChunks) }));
    saved.push(`${findingsDir}/`);
    if (summary.chunksFailed.length > 0) return 1;
    return mergeAndExport(claude, approved);
  }

  /** Fold the findings into rules and write the five exports. Returns the exit code; adds the exports to `saved`. */
  async function mergeAndExport(claude: string, approved: boolean): Promise<number> {
    const plan = await planMerge({ outDir, manifest, force: opts.force });
    if (plan.findings.length === 0) {
      opts.stdout('No findings to merge, so no report was written.\n\n');
      return 0;
    }
    let merged: Merged;
    if (plan.cached !== null) {
      merged = plan.cached;
      opts.stdout(formatMergeTotal(merged, true));
    } else {
      const estimate = plan.calls.reduce((a, c) => a + c.estimate, 0);
      opts.stdout(formatMergePlan(plan.findings.length, plan.calls.length, estimate));
      if (!approved) {
        if (!opts.stdin!.isTTY) {
          opts.stderr('Not merging: there is no terminal to ask for a yes. Pass --yes to run.\n');
          return 2;
        }
        const question = `Merge now? [y/N] `;
        if (!(await confirm(opts.stdin!, opts.stdout, question))) {
          opts.stdout('Nothing was sent to Claude.\n\n');
          return 0;
        }
      }
      try {
        merged = await runMerge({
          claude,
          outDir,
          plan,
          concurrency: opts.concurrency,
          model: opts.model,
          env,
          onProgress: (p) => opts.stdout(formatMergeProgress(p)),
        });
      } catch (err) {
        const why = err instanceof Error ? err.message : String(err);
        opts.stdout(`  Merge failed: ${why}\n  The findings are kept; run the same command again to merge.\n\n`);
        return 1;
      }
      opts.stdout(formatMergeTotal(merged, false));
    }
    if (opts.lang === 'en') {
      const todo = needsTranslation(merged).length;
      if (todo > 0) {
        opts.stdout(`Translating ${todo === 1 ? '1 title' : `${n(todo)} titles`} into English for the share card with Claude Code\n`);
        try {
          await translateTitles({ claude, outDir, merged, model: opts.model, env });
        } catch (err) {
          const why = err instanceof Error ? err.message : String(err);
          opts.stdout(`  ${why}\n  share.txt and share.html keep the original titles; run the same command again to retry.\n`);
        }
        opts.stdout('\n');
      }
    }
    const top = repeated.instructions[0];
    const input = {
      merged,
      stats,
      repeatedTop: top === undefined ? null : { label: top.label, count: top.count },
      lang: opts.lang,
      cardSize: opts.cardSize,
    };
    const removed: { file: ExportFile; hits: Hit[] }[] = [];
    const files = await writeExports(outDir, input, {
      allowPaths: opts.allowPaths,
      names: projectNames(stats.perProject.map((p) => p.project)),
      onRemoved: (file, hits) => removed.push({ file, hits }),
    });
    opts.stdout(formatTopRules(input) + '\n');
    if (removed.length > 0) opts.stdout(formatGate(removed) + '\n');
    saved.push(...files.map(display));
    await sharePng(path.join(outDir, 'share.html'));
    return 0;
  }

  /** share.png from share.html with the Chrome found, or a line on how to make it by hand. */
  async function sharePng(html: string): Promise<void> {
    const png = path.join(path.dirname(html), 'share.png');
    await rm(png, { force: true }); // an image of an earlier card must not stay next to this one
    const hint = 'Open share.html in a browser and take a screenshot to get the image.\n';
    const chrome = await findChrome(env);
    if (chrome === null) {
      opts.stdout(hint + '\n');
      return;
    }
    const why = await screenshotCard(chrome, html, png, opts.cardSize ?? DEFAULT_CARD_SIZE, { env });
    opts.stdout(why === null ? `Saved ${display(png)}\n\n` : `  Could not make share.png: ${why}\n${hint}\n`);
  }
}

/** Ask a y/N question on the given input; anything but y or yes, or no answer at all, is no. */
async function confirm(
  input: NodeJS.ReadableStream,
  write: (text: string) => void,
  question: string,
): Promise<boolean> {
  write(question);
  const rl = createInterface({ input, terminal: false });
  try {
    const answer = await new Promise<string | null>((resolve) => {
      rl.once('line', resolve);
      rl.once('close', () => resolve(null));
    });
    return answer !== null && /^\s*y(es)?\s*$/i.test(answer);
  } finally {
    rl.close();
  }
}
