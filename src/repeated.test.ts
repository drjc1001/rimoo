import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Prompt } from './history.ts';
import { classify, forExport, groupRepeated, jaccard, normalize, stripPoliteness, trigrams } from './repeated.ts';

// Noon UTC keeps the local calendar date identical in every timezone from UTC-11 to UTC+11.
const at = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d, 12);
let nextId = 1;
const prompt = (display: string, timestamp = at(2026, 1, 1), project = '/a'): Prompt => ({
  id: nextId++,
  display,
  timestamp,
  project,
  sessionId: 's',
  pasteCount: 0,
});

test('normalize: trims, collapses spaces, lowercases, drops trailing half- and full-width punctuation', () => {
  assert.equal(normalize('  Merge  IT\n into   Stage.  '), 'merge it into stage');
  assert.equal(normalize('部署到 stage。'), '部署到 stage');
  assert.equal(normalize('好了嗎？！'), '好了嗎');
  assert.equal(normalize('why?;:'), 'why');
});

test('normalize: a comma inside the sentence counts as a space', () => {
  assert.equal(normalize('merged, help me deploy'), 'merged help me deploy');
  assert.equal(normalize('merged，部署 stage'), 'merged 部署 stage');
});

test('normalize: paste placeholders vanish, leaving what was typed around them', () => {
  assert.equal(normalize('look at this [Pasted text #1 +3 lines]'), 'look at this');
  assert.equal(normalize('[Pasted text #2] fix it.'), 'fix it');
  assert.equal(normalize('[Pasted text #1 +48 lines]'), '');
});

test('stripPoliteness: English words anywhere as whole words, Chinese words only at either end', () => {
  assert.equal(stripPoliteness('please continue'), 'continue');
  assert.equal(stripPoliteness('ok then deploy it please'), 'deploy it');
  assert.equal(stripPoliteness('merged help me deploy'), 'merged help me deploy');
  assert.equal(stripPoliteness('merged and please help me deploy'), 'merged help me deploy');
  assert.equal(stripPoliteness('commit and push'), 'commit push');
  assert.equal(stripPoliteness('okay go'), 'go');
  assert.equal(stripPoliteness('okaygo'), 'okaygo');
  assert.equal(stripPoliteness('請幫我部署 stage 謝謝'), '部署 stage');
  assert.equal(stripPoliteness('麻煩 看一下, 謝謝'), '看一下');
  assert.equal(stripPoliteness('部署請稍候'), '部署請稍候');
});

test('stripPoliteness: can leave nothing', () => {
  assert.equal(stripPoliteness('yes please'), '');
  assert.equal(stripPoliteness('ok 謝謝'), '');
});

test('trigrams and jaccard: known values', () => {
  assert.deepEqual([...trigrams('abcd')], ['abc', 'bcd']);
  assert.deepEqual([...trigrams('部署到 stage')].slice(0, 2), ['部署到', '署到 ']);
  assert.equal(trigrams('ab').size, 0);
  // abcde → abc bcd cde; abcdf → abc bcd cdf: 2 shared of 4.
  assert.equal(jaccard(trigrams('abcde'), trigrams('abcdf')), 0.5);
  assert.equal(jaccard(trigrams('abcd'), trigrams('abcd')), 1);
  assert.equal(jaccard(trigrams('abc'), trigrams('xyz')), 0);
  assert.equal(jaccard(new Set(), new Set()), 1);
});

test('groupRepeated: sorts prompts into slash commands, short replies and instructions', () => {
  const r = groupRepeated(
    [
      prompt('/compact'),
      prompt('  /compact keep the plan'),
      prompt('/model opus'),
      prompt('/data/repos/app is the repo'),
      prompt('yes'),
      prompt('Yes.'),
      prompt('繼續'),
      prompt('yes, please'),
      prompt('go ahead'),
      prompt('continue'),
      prompt('please continue'),
      prompt('Continue!'),
      prompt('commit this'),
      prompt('   '),
      prompt('[Pasted text #1 +9 lines]'),
    ],
    { similarity: 0.8 },
  );
  assert.deepEqual(
    r.slashCommands.map((g) => [g.key, g.count]),
    [
      ['/compact', 2],
      ['/model', 1],
    ],
  );
  // Short replies are keyed after politeness removal, so "please continue" and "continue" meet.
  assert.deepEqual(
    r.shortReplies.map((g) => [g.key, g.label, g.count]),
    [
      ['continue', 'continue', 3],
      ['yes', 'yes', 2],
      ['go ahead', 'go ahead', 1],
      ['yes please', 'yes please', 1],
      ['繼續', '繼續', 1],
    ],
  );
  assert.deepEqual(
    r.instructions.map((g) => [g.key, g.count]),
    [
      ['/data/repos/app is the repo', 1],
      ['commit this', 1],
    ],
  );
  assert.equal(r.slashCommands[0]!.variants, undefined);
});

test('groupRepeated: exact groups carry count, projects, first and last date, distinct examples, ids', () => {
  const ps = [
    prompt('Merge it into stage', at(2026, 3, 5), '/a'),
    prompt('merge it into stage.', at(2026, 1, 2), '/b'),
    prompt('please merge it into stage', at(2026, 9, 20), '/a'),
    prompt('merge it into stage', at(2026, 4, 1), '/c'),
    prompt('merge it into stage', at(2026, 4, 2), '/c'),
    prompt('merged, help me deploy', at(2026, 2, 1), '/a'),
    prompt('Merged help me deploy!', at(2026, 2, 2), '/a'),
  ];
  const r = groupRepeated(ps, { similarity: 1 });
  const [a, b] = r.instructions;
  assert.equal(a!.key, 'merge it into stage');
  assert.equal(a!.label, 'merge it into stage');
  assert.equal(a!.count, 5);
  assert.equal(a!.projects, 3);
  assert.equal(a!.first, '2026-01-02');
  assert.equal(a!.last, '2026-09-20');
  assert.deepEqual(a!.examples, ['Merge it into stage', 'merge it into stage.', 'please merge it into stage']);
  assert.deepEqual(
    a!.ids,
    ps.slice(0, 5).map((p) => p.id),
  );
  assert.deepEqual(a!.variants, []);
  assert.equal(b!.key, 'merged help me deploy');
  assert.equal(b!.count, 2);
});

test('groupRepeated: the label is the wording typed most often, the key is what matched', () => {
  const ps = [
    prompt('commit and push'),
    prompt('commit and push'),
    prompt('commit, push'),
    prompt('please commit and push'),
  ];
  const r = groupRepeated(ps, { similarity: 1 });
  assert.equal(r.instructions.length, 1);
  assert.equal(r.instructions[0]!.key, 'commit push');
  assert.equal(r.instructions[0]!.label, 'commit and push');
  assert.equal(r.instructions[0]!.count, 4);
});

test('groupRepeated: ties sort by key', () => {
  const r = groupRepeated([prompt('run the tests'), prompt('deploy to stage')], { similarity: 0.8 });
  assert.deepEqual(
    r.instructions.map((g) => g.key),
    ['deploy to stage', 'run the tests'],
  );
});

test('groupRepeated: near-identical instructions fold into the most repeated one', () => {
  const ps = [
    prompt('i will compact before next round', at(2026, 5, 1), '/a'),
    prompt('i will compact before next round', at(2026, 5, 2), '/a'),
    prompt('i will compact before next round', at(2026, 5, 3), '/b'),
    prompt('I will compact before next rounds', at(2026, 6, 1), '/c'),
    prompt('i will compact before next rounds', at(2026, 6, 2), '/c'),
    prompt('i will compact before the next round', at(2026, 1, 9), '/d'),
    prompt('something entirely different here', at(2026, 5, 1), '/a'),
  ];
  const r = groupRepeated(ps, { similarity: 0.8 });
  assert.equal(r.instructions.length, 2);
  const g = r.instructions[0]!;
  assert.equal(g.key, 'i will compact before next round');
  assert.equal(g.label, 'i will compact before next round');
  assert.equal(g.count, 6);
  assert.equal(g.projects, 4);
  assert.equal(g.first, '2026-01-09');
  assert.equal(g.last, '2026-06-02');
  // Representative's examples first, then filled from the variants up to 3.
  assert.deepEqual(g.examples, [
    'i will compact before next round',
    'I will compact before next rounds',
    'i will compact before next rounds',
  ]);
  assert.deepEqual(g.variants, ['i will compact before next rounds', 'i will compact before the next round']);
  assert.deepEqual(
    g.ids,
    ps.slice(0, 6).map((p) => p.id),
  );
  assert.equal(r.instructions[1]!.key, 'something entirely different here');
});

test('groupRepeated: a stricter threshold keeps near-identical instructions apart', () => {
  const ps = [prompt('i will compact before next round'), prompt('i will compact before next round')];
  ps.push(prompt('i will compact before the next round'));
  const loose = groupRepeated(ps, { similarity: 0.8 });
  const strict = groupRepeated(ps, { similarity: 0.95 });
  assert.equal(loose.instructions.length, 1);
  assert.equal(strict.instructions.length, 2);
});

test('groupRepeated: keys shorter than 12 characters are grouped exactly, never folded', () => {
  // "commit this" and "commit thi5" share most trigrams, but both keys are under 12 characters.
  const ps = [prompt('commit this'), prompt('commit this'), prompt('commit thi5'), prompt('commit it now')];
  const r = groupRepeated(ps, { similarity: 0.1 });
  assert.deepEqual(
    r.instructions.map((g) => [g.key, g.count]),
    [
      ['commit this', 2],
      ['commit it now', 1],
      ['commit thi5', 1],
    ],
  );
});

test('groupRepeated: single prompts join a cluster but never seed one', () => {
  const ps = [prompt('please deploy the frontend now'), prompt('please deploy the frontend now!')];
  ps.push(prompt('please deploy the frontend now x'), prompt('deploy the frontend now y'));
  const r = groupRepeated(ps, { similarity: 0.7 });
  assert.equal(r.instructions.length, 1);
  assert.equal(r.instructions[0]!.count, 4);
  // Two singles alone stay apart even when they look alike: nothing repeated seeded a cluster.
  const s = groupRepeated([prompt('deploy the frontend now x'), prompt('deploy the frontend now y')], {
    similarity: 0.5,
  });
  assert.equal(s.instructions.length, 2);
});

test('forExport: keeps groups seen at least twice and counts the rest', () => {
  const r = groupRepeated(
    [prompt('commit this'), prompt('commit this'), prompt('run the tests'), prompt('yes'), prompt('/compact')],
    { similarity: 0.8 },
  );
  const e = forExport(r);
  assert.deepEqual(
    e.instructions.map((g) => g.key),
    ['commit this'],
  );
  assert.deepEqual(e.shortReplies, []);
  assert.deepEqual(e.slashCommands, []);
  assert.deepEqual(e.singletons, { instructions: 1, shortReplies: 1, slashCommands: 1 });
});

test('classify: the four buckets groupRepeated uses', () => {
  assert.deepEqual(classify(prompt('/compact')), { kind: 'slash', key: '/compact', label: '/compact' });
  assert.equal(classify(prompt('/data/repos/app')).kind, 'instruction');
  assert.deepEqual(classify(prompt('[Pasted text #1 +3 lines]')), { kind: 'empty', key: '', label: '' });
  assert.deepEqual(classify(prompt('  ?! ')), { kind: 'empty', key: '', label: '' });
  assert.deepEqual(classify(prompt('Please continue.')), { kind: 'short', key: 'continue', label: 'please continue' });
  assert.deepEqual(classify(prompt('yes please')), { kind: 'short', key: 'yes please', label: 'yes please' });
  assert.deepEqual(classify(prompt('Merged, and please help me deploy')), {
    kind: 'instruction',
    key: 'merged help me deploy',
    label: 'merged and please help me deploy',
  });
});
