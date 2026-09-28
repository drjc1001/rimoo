import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

/** The skill name used when SKILL.md has no `name:` line in its frontmatter. */
export const DEFAULT_SKILL_NAME = 'my-workstyle';

/** What `--skill-name` accepts: the characters Claude Code allows in a skill's folder name. */
export const SKILL_NAME = /^[a-z0-9][a-z0-9-]*$/;

function home(env: NodeJS.ProcessEnv): string {
  return env.HOME ?? env.USERPROFILE ?? homedir();
}

/**
 * Where Claude Code looks for personal skills:
 *   $CLAUDE_CONFIG_DIR/skills when that variable is set, otherwise <home>/.claude/skills (as in history.ts).
 */
export function skillsDir(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(env.CLAUDE_CONFIG_DIR ?? path.join(home(env), '.claude'), 'skills');
}

/** `file` with the home directory written as ~, for the terminal. */
export function tilde(file: string, env: NodeJS.ProcessEnv = process.env): string {
  if (!path.isAbsolute(file)) return file;
  const h = home(env);
  const rel = path.relative(h, file);
  return rel === '' || rel.startsWith('..') || path.isAbsolute(rel) ? file : path.join('~', rel);
}

/** The `name:` in SKILL.md's frontmatter, or my-workstyle when there is none. */
export function skillNameFrom(skillMd: string): string {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(skillMd);
  const name = fm ? /^name:\s*["']?([^"'\r\n]+?)["']?\s*$/m.exec(fm[1]!)?.[1] : undefined;
  return name !== undefined && SKILL_NAME.test(name) ? name : DEFAULT_SKILL_NAME;
}

export interface InstallResult {
  /** installed: written; same: already there with this content; exists: there with other content, left alone. */
  kind: 'installed' | 'same' | 'exists';
  path: string;
}

/** Write SKILL.md to <skillsDir>/<name>/SKILL.md. Never replaces a different file unless `force`. */
export async function installSkill(opts: {
  skillMd: string;
  name: string;
  env?: NodeJS.ProcessEnv;
  force?: boolean;
}): Promise<InstallResult> {
  const dir = path.join(skillsDir(opts.env), opts.name);
  const file = path.join(dir, 'SKILL.md');
  let current: string | null = null;
  try {
    current = await readFile(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
  if (current === opts.skillMd) return { kind: 'same', path: file };
  if (current !== null && !opts.force) return { kind: 'exists', path: file };
  await mkdir(dir, { recursive: true });
  await writeFile(file, opts.skillMd, 'utf8');
  return { kind: 'installed', path: file };
}

/** Everything the install step prints, in one place. Paths are passed in as they should be shown. */
export const TEXT = {
  question: (name: string, dir: string) => `Install as /${name} in ${dir}? [y/N] `,
  replace: (file: string) => `${file} already exists with different rules; replace it? [y/N] `,
  installed: (file: string, name: string) => `Installed ${file} — type /${name} in a new Claude Code session.\n`,
  same: (file: string, name: string) => `/${name} is already installed with these rules (${file}).\n`,
  exists: (file: string) =>
    `${file} already exists with different rules. Pass --skill-name <other> to install under another name, or --force-skill to replace it.\n`,
  hint: (name: string) => `Pass --install-skill to add these rules as /${name} in Claude Code.\n`,
  failed: (why: string) => `Could not install the skill: ${why}\n`,
  claudeMd: (file: string) => `CLAUDE.md: copy ${file} into a project root to have Claude load the rules there.\n`,
};
