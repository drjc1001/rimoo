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

test('installSkill: installed, then same; a different file is kept unless force', async () => {
  await withConfig(async (env, dir) => {
    const file = path.join(dir, 'skills', 'my-workstyle', 'SKILL.md');
    assert.deepEqual(await installSkill({ skillMd: SKILL, name: 'my-workstyle', env }), { kind: 'installed', path: file });
    assert.equal(await readFile(file, 'utf8'), SKILL);
    assert.deepEqual(await installSkill({ skillMd: SKILL, name: 'my-workstyle', env }), { kind: 'same', path: file });

    const newer = SKILL + '\n1. **New rule**\n';
    assert.deepEqual(await installSkill({ skillMd: newer, name: 'my-workstyle', env }), { kind: 'exists', path: file });
    assert.equal(await readFile(file, 'utf8'), SKILL);
    assert.deepEqual(await installSkill({ skillMd: newer, name: 'my-workstyle', env, force: true }), { kind: 'installed', path: file });
    assert.equal(await readFile(file, 'utf8'), newer);
  });
});

test('installSkill: another name goes to its own folder and leaves the first alone', async () => {
  await withConfig(async (env, dir) => {
    await mkdir(path.join(dir, 'skills', 'my-workstyle'), { recursive: true });
    await writeFile(path.join(dir, 'skills', 'my-workstyle', 'SKILL.md'), 'mine\n');
    const r = await installSkill({ skillMd: SKILL, name: 'foo', env });
    assert.deepEqual(r, { kind: 'installed', path: path.join(dir, 'skills', 'foo', 'SKILL.md') });
    assert.equal(await readFile(path.join(dir, 'skills', 'my-workstyle', 'SKILL.md'), 'utf8'), 'mine\n');
  });
});
