// The Claude Code plugin files: the manifests parse, the names line up, and the skill keeps its safety steps.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function readJson(rel: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(path.join(ROOT, rel), 'utf8')) as Record<string, unknown>;
}

async function readSkill(): Promise<{ frontmatter: string; body: string }> {
  const text = await readFile(path.join(ROOT, 'plugin/skills/rimoo/SKILL.md'), 'utf8');
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
  assert.ok(m, 'SKILL.md starts with a --- frontmatter block');
  return { frontmatter: m[1]!, body: m[2]! };
}

test('plugin.json is named rimoo and has the same version as package.json', async () => {
  const plugin = await readJson('plugin/.claude-plugin/plugin.json');
  const pkg = await readJson('package.json');
  assert.equal(plugin.name, 'rimoo');
  assert.equal(plugin.version, pkg.version);
});

test('marketplace.json lists the rimoo plugin from ./plugin/', async () => {
  const market = await readJson('.claude-plugin/marketplace.json');
  assert.equal(market.name, 'rimoo');
  const plugins = market.plugins as Array<Record<string, unknown>>;
  assert.equal(plugins[0]!.name, 'rimoo');
  assert.equal(plugins[0]!.source, './plugin/');
});

test('the skill runs only when the user types /rimoo', async () => {
  const { frontmatter } = await readSkill();
  assert.match(frontmatter, /^name: rimoo$/m);
  assert.match(frontmatter, /^disable-model-invocation: true$/m);
});

test('the skill writes to ~/.rimoo, asks before --yes, and leaves ~/.claude/CLAUDE.md alone', async () => {
  const { body } = await readSkill();
  for (const s of ['--out ~/.rimoo', '--yes', '--sample 2', 'exit code 2']) assert.ok(body.includes(s), `mentions ${s}`);
  assert.ok(body.includes('Do not write to `~/.claude/CLAUDE.md`'), 'says not to write to ~/.claude/CLAUDE.md');
  assert.doesNotMatch(body, /--out (?!~\/\.rimoo)/, 'no other output directory');
});
