/**
 * share.html: a card with the prompts, projects and months, the top five habits and the most repeated line, to post
 * as an image; share.png when a Chrome is found to take the screenshot. Every piece of text goes through the privacy
 * gate before it is escaped into the page, so the page itself is never scanned (its CSS would look like paths).
 */
import { spawn } from 'node:child_process';
import { access, constants, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { redact } from './privacy.ts';

export type CardLang = 'zh' | 'en';

export interface CardSize {
  w: number;
  h: number;
}

export const DEFAULT_CARD_SIZE: CardSize = { w: 1080, h: 1080 };

/** "1200x627" → { w: 1200, h: 627 }; null when it is not two whole numbers from 200 to 4000. */
export function parseCardSize(s: string): CardSize | null {
  const m = /^\s*(\d{3,4})\s*[x×]\s*(\d{3,4})\s*$/i.exec(s);
  if (!m) return null;
  const w = Number(m[1]);
  const h = Number(m[2]);
  if (w < 200 || h < 200 || w > 4000 || h > 4000) return null;
  return { w, h };
}

export interface CardRule {
  text: string;
  frequency: number;
}

export interface CardInput {
  prompts: number;
  projects: number;
  months: number;
  /** The top habits, at most five are shown. */
  rules: CardRule[];
  /** The most repeated instruction as typed, and how many times; null leaves the block out. */
  quote: { text: string; count: number } | null;
  lang: CardLang;
  size?: CardSize | undefined;
  /** Keep paths and project names, as --allow-paths does for the other shared files. */
  allowPaths?: boolean | undefined;
  /** Project names the gate removes. */
  names?: readonly string[] | undefined;
}

export const CARD_RULES = 5;

const TEXT = {
  en: {
    title: 'My AI coding workstyle',
    prompts: (v: number) => (v === 1 ? 'prompt' : 'prompts'),
    projects: (v: number) => (v === 1 ? 'project' : 'projects'),
    months: (v: number) => (v === 1 ? 'month' : 'months'),
    habits: 'What I keep telling my coding agent',
    quote: 'Most repeated line',
    open: '“',
    close: '”',
  },
  zh: {
    title: '我的 AI 協作習慣',
    prompts: () => '則',
    projects: () => '個專案',
    months: () => '個月',
    habits: '我一直在教 AI 的事',
    quote: '最常重複的一句',
    open: '「',
    close: '」',
  },
} as const;

export const CARD_FOOTER = 'Found with Rimoo · npx rimoo analyze';

/** Whole months from the first to the last date, both counted: 2025-11-01 → 2026-09-28 is 11. */
export function monthsBetween(range: { first: string; last: string } | null | undefined): number {
  if (!range) return 0;
  const [y1, m1] = range.first.split('-').map(Number);
  const [y2, m2] = range.last.split('-').map(Number);
  if (!y1 || !m1 || !y2 || !m2) return 0;
  return Math.max(1, (y2 - y1) * 12 + (m2 - m1) + 1);
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

const n = (v: number): string => v.toLocaleString('en-US');

/** The self-contained card page: no outside resource, system fonts, the body exactly w×h. */
export function renderCard(input: CardInput): string {
  const size = input.size ?? DEFAULT_CARD_SIZE;
  const t = TEXT[input.lang];
  // The gate on each string, then the escape: a path or project name never reaches the page.
  const safe = (s: string): string => {
    const one = s.replace(/\s*[\r\n]+\s*/g, ' ').trim();
    const gated = redact(one, { allowPaths: input.allowPaths, names: input.names }).text;
    return escapeHtml(gated);
  };
  const wide = size.w / size.h > 1.4;
  const stat = (v: number, label: string): string =>
    `<div class="stat"><div class="num">${n(v)}</div><div class="label">${escapeHtml(label)}</div></div>`;
  const rules = input.rules
    .slice(0, CARD_RULES)
    .map(
      (r, i) =>
        `<li><span class="rank">${i + 1}</span><span class="text">${safe(r.text.replace(/[。.]+$/, ''))}</span>` +
        `<span class="count">${n(r.frequency)}×</span></li>`,
    )
    .join('');
  const quote =
    input.quote === null
      ? ''
      : `<section class="quote"><div class="kicker">${escapeHtml(t.quote)}</div>` +
        `<p><span class="q">${t.open}${safe(input.quote.text)}${t.close}</span><span class="count">×${n(input.quote.count)}</span></p></section>`;
  const stats =
    `<section class="stats">${stat(input.prompts, t.prompts(input.prompts))}${stat(input.projects, t.projects(input.projects))}` +
    `${input.months > 0 ? stat(input.months, t.months(input.months)) : ''}</section>`;
  const habits = rules === '' ? '' : `<section class="habits"><h2>${escapeHtml(t.habits)}</h2><ol>${rules}</ol></section>`;
  const head = `<header>${escapeHtml(t.title)}</header>`;
  const footer = `<footer>${escapeHtml(CARD_FOOTER)}</footer>`;
  const body = wide
    ? `<div class="col left">${head}${stats}</div><div class="col right">${habits}${quote}${footer}</div>`
    : `${head}${stats}${habits}${quote}${footer}`;
  return `<!doctype html>
<html lang="${input.lang === 'zh' ? 'zh-Hant' : 'en'}">
<head>
<meta charset="utf-8">
<title>${escapeHtml(t.title)}</title>
<style>
:root { --ink: #16181d; --soft: #4a4f59; --line: #e2dccf; --accent: #c2410c; --paper: #faf7f0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: ${size.w}px; height: ${size.h}px; overflow: hidden; }
body {
  background: var(--paper); color: var(--ink);
  font-family: -apple-system, "Segoe UI", "Noto Sans TC", "Noto Sans CJK TC", sans-serif;
  font-size: 30px; line-height: 1.3;
  padding: ${wide ? '48px 56px' : '72px 80px'};
  display: flex; ${wide ? 'flex-direction: row; gap: 32px;' : 'flex-direction: column; justify-content: space-between;'}
}
.col { display: flex; flex-direction: column; justify-content: space-between; min-width: 0; }
.left { flex: 0 0 auto; }
.right { flex: 1 1 auto; }
header { font-size: ${wide ? 30 : 36}px; font-weight: 700; color: var(--accent); }
.stats { ${wide ? 'display: grid; grid-template-columns: auto auto; justify-content: start; align-items: baseline; column-gap: 18px; row-gap: 14px;' : 'display: flex; gap: 64px;'} }
${wide ? '.stat { display: contents; } .num { text-align: right; }' : ''}
.num { font-size: ${wide ? 80 : 112}px; font-weight: 800; line-height: 1; letter-spacing: -0.02em; }
.label { font-size: 28px; color: var(--soft); ${wide ? '' : 'margin-top: 10px;'} }
h2 { font-size: ${wide ? 30 : 36}px; font-weight: 700; margin-bottom: ${wide ? 10 : 16}px; }
ol { list-style: none; }
li {
  display: flex; align-items: baseline; gap: 20px;
  padding: ${wide ? 7 : 14}px 0; border-top: 2px solid var(--line);
  font-size: ${wide ? 28 : 32}px;
}
li:last-child { border-bottom: 2px solid var(--line); }
.rank { flex: 0 0 auto; width: 1.1em; font-weight: 800; color: var(--accent); }
.text, .q { flex: 1 1 auto; min-width: 0; }
.text { font-weight: 600; }
/* One line per habit, cut with an ellipsis; the quote gets two lines on the square card. */
.text, .q { display: -webkit-box; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; }
.text { -webkit-line-clamp: 1; }
.q { -webkit-line-clamp: ${wide ? 1 : 2}; }
.count { flex: 0 0 auto; font-weight: 700; color: var(--accent); font-variant-numeric: tabular-nums; }
.kicker { font-size: 28px; color: var(--soft); margin-bottom: ${wide ? 2 : 8}px; }
.quote p { display: flex; align-items: baseline; gap: 20px; font-size: ${wide ? 30 : 36}px; font-weight: 700; }
.quote .q { flex: 0 1 auto; }
footer { font-size: 28px; color: var(--soft); }
</style>
</head>
<body class="${wide ? 'wide' : 'square'}">
${body}
</body>
</html>
`;
}

/** A Chrome or Chromium to take the screenshot with, or null. Looked for as `findClaude` looks for claude. */
export async function findChrome(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): Promise<string | null> {
  const win = platform === 'win32';
  const key = win ? Object.keys(env).find((k) => k.toUpperCase() === 'PATH') : 'PATH';
  const dirs = (key === undefined ? '' : (env[key] ?? '')).split(win ? ';' : ':').filter(Boolean);
  const names = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'chrome'];
  const isExe = async (file: string): Promise<boolean> => {
    try {
      if (!(await stat(file)).isFile()) return false;
      if (!win) await access(file, constants.X_OK);
      return true;
    } catch {
      return false;
    }
  };
  for (const name of names) {
    for (const dir of dirs) {
      for (const file of win ? [`${name}.exe`, name] : [name]) {
        const full = path.join(dir.replace(/^"(.*)"$/, '$1'), file);
        if (await isExe(full)) return full;
      }
    }
  }
  if (platform === 'darwin') {
    const app = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    if (await isExe(app)) return app;
  }
  return null;
}

export const SCREENSHOT_TIMEOUT_MS = 30_000;

/** Screenshot the card with headless Chrome. Returns null when share.png was written, else why not; never throws. */
export async function screenshotCard(
  chrome: string,
  htmlPath: string,
  pngPath: string,
  size: CardSize = DEFAULT_CARD_SIZE,
  opts: { env?: NodeJS.ProcessEnv | undefined; timeoutMs?: number | undefined } = {},
): Promise<string | null> {
  const timeoutMs = opts.timeoutMs ?? SCREENSHOT_TIMEOUT_MS;
  const args = [
    '--headless=new',
    `--screenshot=${pngPath}`,
    `--window-size=${size.w},${size.h}`,
    '--hide-scrollbars',
    '--disable-gpu',
    pathToFileURL(path.resolve(htmlPath)).href,
  ];
  const why = await new Promise<string | null>((resolve) => {
    let err = '';
    let child;
    try {
      child = spawn(chrome, args, { env: opts.env ?? process.env, stdio: ['ignore', 'ignore', 'pipe'] });
    } catch (e) {
      resolve(e instanceof Error ? e.message : String(e));
      return;
    }
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve(`Chrome did not finish within ${Math.round(timeoutMs / 1000)} s`);
    }, timeoutMs);
    child.stderr?.on('data', (b: Buffer) => (err = (err + b.toString('utf8')).slice(-2000)));
    child.on('error', (e) => {
      clearTimeout(timer);
      resolve(e.message);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve(code === 0 ? null : `Chrome exited with code ${code}${err.trim() ? `: ${err.trim().split('\n').pop()}` : ''}`);
    });
  });
  if (why !== null) return why;
  try {
    if ((await stat(pngPath)).size === 0) return 'Chrome wrote an empty image';
  } catch {
    return 'Chrome finished without writing the image';
  }
  return null;
}
