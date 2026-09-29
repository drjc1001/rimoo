import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { installSkill, skillNameFrom, skillsDir, tilde } from './install.ts';

async function withConfig(fn: (env: NodeJS.ProcessEnv, dir: string) => Promise<void>) {
  const dir = await mkdtemp(path.join(tmpdir(), 'rimoo-config-'));
  try {
    await fn({ CLAUDE_CONFIG_DIR: dir, HOME: path.join(dir, 'home') }, dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const SKILL = '---\nname: my-workstyle\ndescription: "x"\n---\n\n# My workstyle\n';

test('skillsDir: $CLAUDE_CONFIG_DIR/skills, else $HOME/.claude/skills', () => {
  assert.equal(skillsDir({ CLAUDE_CONFIG_DIR: '/c', HOME: '/h' }), path.join('/c', 'skills'));
  assert.equal(skillsDir({ HOME: '/h' }), path.join('/h', '.claude', 'skills'));
  assert.equal(tilde('/h/.claude/skills', { HOME: '/h' }), path.join('~', '.claude', 'skills'));
  assert.equal(tilde('/elsewhere/x', { HOME: '/h' }), '/elsewhere/x');
  assert.equal(tilde('rimoo-out/CLAUDE.md', { HOME: '/h' }), 'rimoo-out/CLAUDE.md');
});

test('skillNameFrom: the frontmatter name, else my-workstyle', () => {
  assert.equal(skillNameFrom('---\nname: team-style\ndescription: "x"\n---\n'), 'team-style');
  assert.equal(skillNameFrom('---\ndescription: "x"\n---\nname: not-this\n'), 'my-workstyle');
  assert.equal(skillNameFrom('# no frontmatter\nname: nope\n'), 'my-workstyle');
  assert.equal(skillNameFrom('---\nname: ../bad\n---\n'), 'my-workstyle');
});

const RULES = '# Rules\n\n1. **Rule.**\n';
const FILES = { 'SKILL.md': SKILL, 'rules.md': RULES };

test('installSkill: both files written, then same; a different set is kept unless force', async () => {
  await withConfig(async (env, dir) => {
    const skill = path.join(dir, 'skills', 'my-workstyle');
    const read = (f: string) => readFile(path.join(skill, f), 'utf8');
    assert.deepEqual(await installSkill({ files: FILES, name: 'my-workstyle', env }), { kind: 'installed', path: skill });
    assert.equal(await read('SKILL.md'), SKILL);
    assert.equal(await read('rules.md'), RULES);
    assert.deepEqual(await installSkill({ files: FILES, name: 'my-workstyle', env }), { kind: 'same', path: skill });

    // Only rules.md differs: still exists, and neither file is touched.
    const newer = { 'SKILL.md': SKILL + '\n1. **New rule**\n', 'rules.md': RULES + '2. **New rule.**\n' };
    const onlyRules = { 'SKILL.md': SKILL, 'rules.md': newer['rules.md'] };
    assert.deepEqual(await installSkill({ files: onlyRules, name: 'my-workstyle', env }), { kind: 'exists', path: skill });
    assert.deepEqual(await installSkill({ files: newer, name: 'my-workstyle', env }), { kind: 'exists', path: skill });
    assert.equal(await read('SKILL.md'), SKILL);
    assert.equal(await read('rules.md'), RULES);

    assert.deepEqual(await installSkill({ files: newer, name: 'my-workstyle', env, force: true }), { kind: 'installed', path: skill });
    assert.equal(await read('SKILL.md'), newer['SKILL.md']);
    assert.equal(await read('rules.md'), newer['rules.md']);
  });
});

test('installSkill: an older install with SKILL.md only gets rules.md added; a different old SKILL.md is exists', async () => {
  await withConfig(async (env, dir) => {
    const skill = path.join(dir, 'skills', 'my-workstyle');
    await mkdir(skill, { recursive: true });
    await writeFile(path.join(skill, 'SKILL.md'), SKILL);
    assert.deepEqual(await installSkill({ files: FILES, name: 'my-workstyle', env }), { kind: 'installed', path: skill });
    assert.equal(await readFile(path.join(skill, 'rules.md'), 'utf8'), RULES);

    await writeFile(path.join(skill, 'SKILL.md'), 'old 147 rules\n');
    await rm(path.join(skill, 'rules.md'));
    assert.deepEqual(await installSkill({ files: FILES, name: 'my-workstyle', env }), { kind: 'exists', path: skill });
    await assert.rejects(readFile(path.join(skill, 'rules.md'), 'utf8'));
  });
});

test('installSkill: another name goes to its own folder and leaves the first alone', async () => {
  await withConfig(async (env, dir) => {
    await mkdir(path.join(dir, 'skills', 'my-workstyle'), { recursive: true });
    await writeFile(path.join(dir, 'skills', 'my-workstyle', 'SKILL.md'), 'mine\n');
    const r = await installSkill({ files: FILES, name: 'foo', env });
    assert.deepEqual(r, { kind: 'installed', path: path.join(dir, 'skills', 'foo') });
    assert.equal(await readFile(path.join(dir, 'skills', 'my-workstyle', 'SKILL.md'), 'utf8'), 'mine\n');
  });
});
