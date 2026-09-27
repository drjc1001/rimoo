// Test helper, not a test: findings/NNN.json for three chunks, as if Claude Code had analyzed them.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Manifest } from './chunks.ts';
import type { ChunkFindings, Finding } from './runner.ts';

const sha256 = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex');

/**
 * Seven findings over the manifest's first three chunks, numbered in merge order:
 * 1 A communication (chunk 1, every id of chunk 1), 2 P planning (chunk 1), 3 B communication (chunk 2, every id of
 * chunk 2 plus chunk 1's first again), 4 T testing (chunk 2), 5 C communication (chunk 2), 6 D communication
 * (chunk 3), 7 E communication in English (chunk 3). Quote dates are wrong on purpose ("x"): merge reads the real
 * ones from chunks/NNN.jsonl.
 */
export const FIXTURE_RULES = {
  A: '結論先講，理由放後面。',
  P: '動手前先給計畫，等他點頭再寫程式。',
  B: '先講結論。',
  T: '有測試才算做完。',
  C: '回報用條列編號，方便逐項回覆。',
  D: '不要客套話。',
  E: 'Keep answers short and plain.',
} as const;

export const quoteOf = (id: number): string => `原句 ${id}`;

export async function writeFindingsFixture(outDir: string, manifest: Manifest): Promise<number[][]> {
  const ids: number[][] = [];
  for (const chunk of manifest.chunks.slice(0, 3)) {
    const text = await readFile(path.join(outDir, chunk.file), 'utf8');
    ids.push(text.trim().split('\n').map((l) => (JSON.parse(l) as { id: number }).id));
  }
  const ev = (list: number[]) => list.map((id) => ({ id, ts: 'x', quote: quoteOf(id) }));
  const f = (category: Finding['category'], rule: string, frequency: number, confidence: Finding['confidence'], evidence: number[], trigger: string | null): Finding => ({
    category, rule, frequency, confidence, evidence: ev(evidence), trigger,
  });
  const [c1, c2, c3] = ids as [number[], number[], number[]];
  const perChunk: Finding[][] = [
    [f('communication', FIXTURE_RULES.A, 5, 'high', c1, null), f('planning', FIXTURE_RULES.P, 4, 'high', [c1[0]!], '開新功能時')],
    [
      f('communication', FIXTURE_RULES.B, 3, 'high', [...c2, c1[0]!], '看到長篇回報後'),
      f('testing', FIXTURE_RULES.T, 2, 'low', [c2[0]!], null),
      f('communication', FIXTURE_RULES.C, 4, 'medium', [c2[c2.length - 1]!], null),
    ],
    [f('communication', FIXTURE_RULES.D, 2, 'medium', [c3[0]!], null), f('communication', FIXTURE_RULES.E, 3, 'high', [c3[c3.length - 1]!], null)],
  ];
  await mkdir(path.join(outDir, 'findings'), { recursive: true });
  for (const [i, findings] of perChunk.entries()) {
    const chunk = manifest.chunks[i]!;
    const prompt = await readFile(path.join(outDir, chunk.promptFile), 'utf8');
    const done: ChunkFindings = {
      chunk: chunk.index,
      promptSha256: sha256(prompt),
      model: 'claude-fake-1',
      usage: { input: 1, cacheCreation: 0, cacheRead: 0, output: 1, thinking: 0, total: 2 },
      costUsd: 0.01,
      durationMs: 1000,
      findings,
      dropped: { findings: 0, evidence: 0 },
    };
    await writeFile(path.join(outDir, 'findings', `${String(chunk.index).padStart(3, '0')}.json`), JSON.stringify(done, null, 2) + '\n');
  }
  return ids;
}
