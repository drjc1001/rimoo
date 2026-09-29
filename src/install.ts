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
  /** The skill's folder. */
  path: string;
}

/**
 * Write each of `files` (path relative to the skill folder, such as checklists/plan.md → content) into
 * <skillsDir>/<name>/, making the folders on the way, as one set: `same` when every file is already
 * there with this content, `exists` when any is there with other content (then nothing is written), unless `force`.
 */
export async function installSkill(opts: {
  files: Record<string, string>;
  name: string;
  env?: NodeJS.ProcessEnv;
  force?: boolean;
}): Promise<InstallResult> {
  const dir = path.join(skillsDir(opts.env), opts.name);
  let same = true;
  let differs = false;
  for (const [file, text] of Object.entries(opts.files)) {
    let current: string | null = null;
    try {
      current = await readFile(path.join(dir, file), 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
    if (current !== text) same = false;
    if (current !== null && current !== text) differs = true;
  }
  if (same) return { kind: 'same', path: dir };
  if (differs && !opts.force) return { kind: 'exists', path: dir };
  for (const [file, text] of Object.entries(opts.files)) {
    const target = path.join(dir, file);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, text, 'utf8');
  }
  return { kind: 'installed', path: dir };
}

/** Everything the install step prints, in one place. Paths are passed in as they should be shown. */
export const TEXT = {
  question: (name: string, dir: string) => `Install as /${name} in ${dir}? [y/N] `,
  replace: (dir: string) => `${dir} already exists with different rules; replace it? [y/N] `,
  installed: (dir: string) => `Installed ${dir}\n`,
  same: (dir: string, name: string) => `/${name} is already installed with these rules (${dir}).\n`,
  exists: (dir: string) =>
    `${dir} already exists with different rules. Pass --skill-name <other> to install under another name, or --force-skill to replace it.\n`,
  failed: (why: string) => `Could not install the skill: ${why}\n`,
};
