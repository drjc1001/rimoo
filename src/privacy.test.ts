import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatRemoved, redact, scan, type HitKind } from './privacy.ts';
import { projectNames } from './privacy.ts';

const kinds = (text: string, allowPaths = false): [HitKind, string][] => scan(text, { allowPaths }).map((h) => [h.kind, h.text]);

/** Text that must never be taken for anything: dates, counts, numbered replies, keys, slashes, commands. */
const CLEAN = [
  '2026-09-27',
  '2026/09/27 09:30',
  '24,051 prompts',
  '1.ok 2.不用',
  'merge_it_into_stage',
  'stage／prod',
  'node --test',
  '1/2 of the chunks',
  'yes/no and/or N/A',
  'v1.2.3 and 10.0.19045',
  '/compact',
  '結論先講，理由放後面。',
  '14:05:59',
  '0.1234567',
  'a1b2c3',
  'rewriteRelativeImportExtensions',
];

test('scan: nothing in ordinary text', () => {
  for (const t of CLEAN) assert.deepEqual(kinds(t), [], t);
});

test('scan path: absolute Unix paths of two segments or more, ~/…, Windows drives', () => {
  assert.deepEqual(kinds('在 /data/repos/x 跑'), [['path', '/data/repos/x']]);
  assert.deepEqual(kinds('寫到 /home/me/.claude。'), [['path', '/home/me/.claude']]);
  assert.deepEqual(kinds('看 ~/.claude/skills/x/SKILL.md'), [['path', '~/.claude/skills/x/SKILL.md']]);
  assert.deepEqual(kinds(String.raw`存到 C:\Users\me\notes.txt 裡`), [['path', String.raw`C:\Users\me\notes.txt`]]);
  assert.deepEqual(kinds('D:/work/app'), [['path', 'D:/work/app']]);
  // Not a path: one segment, a date, a fraction, the path part of a URL or domain.
  assert.deepEqual(kinds('/compact 然後 1/2，2026/09/27，example.com/a/b'), []);
  assert.deepEqual(kinds('/data/repos/x', true), []);
});

test('scan email', () => {
  assert.deepEqual(kinds('寄給 someone.name+tag@mail.example.co，謝謝'), [['email', 'someone.name+tag@mail.example.co']]);
  assert.deepEqual(kinds('@claude 看一下、user@localhost、a@b'), []);
});

test('scan url: http and https, sentence punctuation left out, the path in it not counted again', () => {
  assert.deepEqual(kinds('見 https://example.com/a/b?x=1。'), [['url', 'https://example.com/a/b?x=1']]);
  assert.deepEqual(kinds('(http://localhost:3000/admin).'), [['url', 'http://localhost:3000/admin']]);
  assert.deepEqual(kinds('https://example.com/a/b', true), [['url', 'https://example.com/a/b']]);
  assert.deepEqual(kinds('ftp 或 www.example.com 不算'), []);
});

test('scan phone: Taiwan mobiles and +country numbers, not dates, counts, times or versions', () => {
  assert.deepEqual(kinds('打 0912-345-678 或 0912345678'), [
    ['phone', '0912-345-678'],
    ['phone', '0912345678'],
  ]);
  assert.deepEqual(kinds('+886 912 345 678'), [['phone', '+886 912 345 678']]);
  assert.deepEqual(kinds('+886912345678、+1 415 555 0100'), [
    ['phone', '+886912345678'],
    ['phone', '+1 415 555 0100'],
  ]);
  assert.deepEqual(kinds('2026-09-27 09:30、24,051、v0912.345.678、+12、09-27'), []);
});

test('scan secret: the known key shapes, long hex and long base64', () => {
  const secrets = [
    'sk-abcdefghijklmnop1234',
    'AKIAIOSFODNN7EXAMPLE',
    'ghp_abcdefghijklmnopqrstuvwxyz0123',
    'xoxb-1234567890-abcdefghij',
    'AIzaSyA1234567890abcdefghijklmnopqrstu',
    '-----BEGIN RSA PRIVATE KEY-----',
    'd41d8cd98f00b204e9800998ecf8427e',
    'QWxhZGRpbjpvcGVuIHNlc2FtZQ9876543210ABCDEFGH',
  ];
  for (const s of secrets) assert.deepEqual(kinds(`key: ${s} end`), [['secret', s]], s);
  // Not a secret: short hex, sk- too short, a long camelCase word, a long path.
  assert.deepEqual(kinds('abc123def、sk-short、rewriteRelativeImportExtensionsForTheWholeProject'), []);
  assert.deepEqual(kinds('/data/repos/Project2024/SomethingQuiteLongIndeed/x'), [['path', '/data/repos/Project2024/SomethingQuiteLongIndeed/x']]);
});

test('redact: hits become [removed], lines keep their numbers, only the kinds asked for', () => {
  const text = ['# Title', '- 路徑 /data/repos/x 與 https://x.io', '- 金鑰 sk-abcdefghijklmnop1234', '- 寫信給 a@b.com'].join('\n');
  const all = redact(text);
  assert.equal(all.text, ['# Title', '- 路徑 [removed] 與 [removed]', '- 金鑰 [removed]', '- 寫信給 [removed]'].join('\n'));
  assert.deepEqual(
    all.hits.map((h) => [h.line, h.kind]),
    [
      [2, 'path'],
      [2, 'url'],
      [3, 'secret'],
      [4, 'email'],
    ],
  );
  assert.equal(redact(text, { allowPaths: true }).text.split('\n')[1], '- 路徑 /data/repos/x 與 [removed]');
  const onlySecrets = redact(text, { kinds: ['secret'] });
  assert.equal(onlySecrets.text, text.replace('sk-abcdefghijklmnop1234', '[removed]'));
  assert.deepEqual(onlySecrets.hits.map((h) => h.kind), ['secret']);
});

test('formatRemoved: counts and lines per kind, the --allow-paths hint only for paths, empty when nothing', () => {
  const hits = redact('/a/b\nhttps://x.io\n\n\n/c/d\n').hits;
  assert.equal(
    formatRemoved('CLAUDE.md', hits),
    '  Removed from CLAUDE.md: 2 file paths (lines 1, 5), 1 URL (line 2). Pass --allow-paths to keep paths and project names.\n',
  );
  assert.equal(formatRemoved('report.md', scan('sk-abcdefghijklmnop1234')), '  Removed from report.md: 1 key or token (line 1).\n');
  assert.equal(formatRemoved('x', []), '');
  const many = scan(Array.from({ length: 12 }, (_, i) => `/p/${i}a`).join('\n'));
  assert.match(formatRemoved('SKILL.md', many), /12 file paths \(lines 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, …\)/);
});

test('projectNames: folder names and the name without its number, longest first, short or numeric ones left out', () => {
  assert.deepEqual(
    projectNames(['/data/repos/068_吉野環保科技', '/data/repos/toy-app', 'C:\\Users\\me\\toy-app-tickets', '/x/app', '/x/2026', '(unknown)']),
    ['toy-app-tickets', '068_吉野環保科技', 'toy-app', '吉野環保科技'],
  );
});

test('redact: project names go too, whole words for ASCII, as written for CJK; --allow-paths keeps them', () => {
  const names = projectNames(['/data/repos/068_吉野環保科技', '/data/repos/toy-app']);
  const text = '沿用 吉野環保科技 的後台 layout；Toy-App 的做法一樣，但 happy-toy-apple 不算。';
  const r = redact(text, { names });
  assert.equal(r.text, '沿用 [removed] 的後台 layout；[removed] 的做法一樣，但 happy-toy-apple 不算。');
  assert.deepEqual(
    r.hits.map((h) => [h.kind, h.text]),
    [
      ['project', '吉野環保科技'],
      ['project', 'Toy-App'],
    ],
  );
  assert.equal(redact(text, { names, allowPaths: true }).hits.length, 0);
  // A path containing the name is one path, not a path and a project name.
  const p = redact('see /data/repos/toy-app/src', { names });
  assert.deepEqual(p.hits.map((h) => h.kind), ['path']);
  assert.match(formatRemoved('CLAUDE.md', r.hits), /2 project names \(line 1\)\. Pass --allow-paths to keep paths and project names\./);
});
