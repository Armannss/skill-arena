// Renders share images for one brief of a run: a blind version (entries A-E)
// and a reveal version (names), each as a 4:5 portrait for LinkedIn and a
// 16:9 card for X and link previews. Output goes to site/share/.
//
//   node scripts/poster.mjs [--run name] [--prompt saas-landing] [--seed 1] [--round "Round 0"]
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { parseArgs, resolveRunId, readJson, RUNS_DIR, SITE_DIR, ARENA_DIR, ROOT } from './lib.mjs';

const args = parseArgs();
const runId = await resolveRunId(args.run);
const runDir = path.join(RUNS_DIR, runId);
const run = await readJson(path.join(runDir, 'run.json'));
const prompt = run.prompts.find((p) => p.id === (args.prompt ?? run.prompts[0].id));
if (!prompt) throw new Error(`Prompt "${args.prompt}" is not in run ${runId}.`);
const seed = Number(args.seed ?? 1);
const round = typeof args.round === 'string' ? args.round : `Run ${runId}`;
const pkg = await readJson(path.join(ROOT, 'package.json'));
const author = pkg.author?.name ?? '';
const repoUrl = (pkg.repository?.url ?? '').replace(/^git\+/, '').replace(/\.git$/, '').replace(/^https:\/\//, '');

const entries = [];
for (const c of run.contenders) {
  const dir = path.join(runDir, prompt.id, c.id, `seed-${seed}`);
  if (!existsSync(path.join(dir, 'work', 'index.html'))) continue;
  const meta = await readJson(path.join(dir, 'meta.json'));
  entries.push({ c, dir, meta });
}
if (entries.length < 2) throw new Error('Need at least two finished pages to make a poster.');

// Same seeded shuffle idea as the gallery: stable for a run, says nothing about who is who.
let h = 2166136261;
for (const ch of `${prompt.id}/${runId}/poster`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
const rand = () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0) / 4294967296;
for (let i = entries.length - 1; i > 0; i--) {
  const j = Math.floor(rand() * (i + 1));
  [entries[i], entries[j]] = [entries[j], entries[i]];
}
entries.forEach((e, i) => (e.letter = String.fromCharCode(65 + i)));

const shotsDir = path.join(ARENA_DIR, 'poster', runId, prompt.id);
const outDir = path.join(SITE_DIR, 'share');
await mkdir(shotsDir, { recursive: true });
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' });

// Sharp captures: the first screen of every page at 1440x900, rendered at 2x.
for (const e of entries) {
  e.shot = path.join(shotsDir, `${e.c.id}.jpg`);
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await ctx.route('**/*', (route) => {
    const url = route.request().url();
    if (/^(file|data|blob):/.test(url) || /^https:\/\/(fonts\.(googleapis|gstatic)\.com|cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com|esm\.sh|rsms\.me|api\.fontshare\.com|cdn\.fontshare\.com)\//.test(url)) return route.continue();
    return route.abort();
  });
  const page = await ctx.newPage();
  await page.goto(pathToFileURL(path.join(e.dir, 'work', 'index.html')).href, { waitUntil: 'load' });
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  await page.evaluate(() => document.fonts?.ready).catch(() => {});
  await page.waitForTimeout(1500);
  await page.screenshot({ path: e.shot, type: 'jpeg', quality: 92 });
  await ctx.close();
}

const formats = {
  portrait: { width: 1080, height: 1350 },
  wide: { width: 1600, height: 900 },
};
const written = [];
for (const reveal of [false, true]) {
  for (const [format, size] of Object.entries(formats)) {
    const html = poster({ format, reveal });
    const file = path.join(shotsDir, `${format}-${reveal ? 'reveal' : 'blind'}.html`);
    await writeFile(file, html);
    const ctx = await browser.newContext({ viewport: size, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await page.goto(pathToFileURL(file).href, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(400);
    const out = path.join(outDir, `${prompt.id}-${reveal ? 'reveal' : 'blind'}-${format}.png`);
    await page.screenshot({ path: out });
    written.push(path.relative(process.cwd(), out));
    await ctx.close();
  }
}
await browser.close();
console.log(written.join('\n'));

function poster({ format, reveal }) {
  const blindLine = 'Which one had no skill?';
  const revealLine = 'Here is who built what.';
  const cards = entries.map((e) => {
    const name = e.c.repo ? e.c.name : 'No skill';
    const status = !e.c.repo ? 'baseline' : e.meta.skillTriggered ? 'skill used' : 'skill never triggered';
    return `<figure class="card">
      <div class="shot"><img src="${pathToFileURL(e.shot).href}" alt=""></div>
      <figcaption><span class="letter">${e.letter}</span>${reveal ? `<span class="name">${esc(name)}</span><span class="status ${status === 'skill never triggered' ? 'warn' : ''}">${status}</span>` : ''}</figcaption>
    </figure>`;
  }).join('');
  const agent = run.agent ?? {};
  const model = String(agent.model ?? '').replace(/^claude-/, '').replace(/-(\d+)-(\d+)$/, ' $1.$2').replace(/^\w/, (m) => m.toUpperCase());
  const letters = entries.map((e) => e.letter);
  const cta = reveal
    ? `Full gallery, transcripts and method at ${esc(repoUrl)}`
    : `Pick one: ${letters.slice(0, -1).join(', ')} or ${letters.at(-1)}. The answer comes tomorrow.`;
  const note = `<div class="note">
      <p class="note-label">The brief</p>
      <p class="note-text">${esc(prompt.brief.split('. ')[0])}.</p>
      <p class="note-meta">Claude Code${model ? ` · ${esc(model)}` : ''} · same prompt for all. Only the installed design skill changed.</p>
      <p class="note-cta">${cta}</p>
    </div>`;
  return `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@500&display=block" rel="stylesheet">
<style>
:root { --navy: #0a1630; --navy-2: #12224a; --lime: #c8f03c; --white: #f6f7fb; --mute: #8d9bc2; }
* { box-sizing: border-box; margin: 0; }
html, body { width: 100%; height: 100%; }
body { background: radial-gradient(120% 80% at 0% 0%, #13275a 0%, var(--navy) 55%) var(--navy); color: var(--white); font-family: Geist, sans-serif; -webkit-font-smoothing: antialiased; }
.frame { position: relative; height: 100%; display: grid; }
.label { font: 500 13px/1 "Geist Mono", monospace; letter-spacing: .28em; text-transform: uppercase; color: var(--mute); }
.label b { color: var(--lime); font-weight: 500; }
h1 { font-weight: 700; letter-spacing: -.035em; line-height: .98; }
h1 span { display: block; }
h1 .l2 { color: var(--lime); }
.grid { display: grid; }
.card { min-width: 0; }
.shot { position: relative; border-radius: 12px; overflow: hidden; background: #fff; box-shadow: 0 0 0 1px rgba(255,255,255,.08), 0 18px 40px -18px rgba(0,0,0,.6); }
.shot img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: top; }
figcaption { display: flex; align-items: center; gap: 10px; margin-top: 10px; font-size: 15px; white-space: nowrap; }
.letter { display: inline-grid; place-items: center; width: 26px; height: 26px; border-radius: 50%; background: var(--lime); color: var(--navy); font-weight: 700; font-size: 14px; }
.name { font-weight: 600; }
.status { font: 500 11px "Geist Mono", monospace; letter-spacing: .12em; text-transform: uppercase; color: var(--mute); }
.status.warn { color: #ffb86b; }
.note { background: var(--white); color: var(--navy); border-radius: 12px; padding: 22px; display: flex; flex-direction: column; gap: 10px; }
.note-label { font: 500 11px "Geist Mono", monospace; letter-spacing: .24em; text-transform: uppercase; color: #5a6890; }
.note-text { font-size: 19px; font-weight: 600; line-height: 1.25; letter-spacing: -.01em; }
.note-meta { font-size: 13px; line-height: 1.45; color: #45537a; margin-top: auto; }
.note-cta { font-size: 15px; font-weight: 600; line-height: 1.35; padding-top: 12px; border-top: 1px solid #d7dcea; }
.foot { display: flex; justify-content: space-between; align-items: baseline; font-size: 15px; color: var(--mute); }
.foot .who { color: var(--white); font-weight: 600; font-size: 17px; }

.portrait .frame { padding: 52px 56px 44px; grid-template-rows: auto auto 1fr auto; gap: 0; }
.portrait h1 { font-size: 62px; margin: 22px 0 30px; }
.portrait .grid { grid-template-columns: 1fr 1fr; gap: 22px 22px; align-content: start; }
.portrait .shot { aspect-ratio: 1.72; }
.portrait .note { aspect-ratio: auto; }
.portrait .foot { padding-top: 18px; }

.wide .frame { padding: 56px; grid-template-columns: 430px 1fr; grid-template-rows: 1fr auto; column-gap: 48px; }
.wide .intro { grid-row: 1 / 3; display: flex; flex-direction: column; }
.wide h1 { font-size: 64px; margin: 26px 0 0; }
.wide .intro .foot { margin-top: auto; flex-direction: column; gap: 6px; }
.wide .grid { grid-template-columns: repeat(3, 1fr); gap: 26px 20px; align-content: center; }
.wide .shot { aspect-ratio: 1.6; }
.wide figcaption { font-size: 14px; gap: 8px; }
.wide .status { font-size: 10px; }
.wide .note { padding: 18px; }
.wide .note-text { font-size: 16px; }
.wide .note-meta { font-size: 12px; }
.wide .note-cta { font-size: 13px; padding-top: 10px; }
</style></head>
<body class="${format}">
<div class="frame">
${format === 'portrait'
    ? `<p class="label"><b>Skill Arena</b> &nbsp;·&nbsp; ${esc(round)} &nbsp;·&nbsp; ${esc(prompt.title)}</p>
  <h1><span>Same prompt. Same agent.</span><span class="l2">${reveal ? revealLine : blindLine}</span></h1>
  <div class="grid">${cards}${note}</div>
  <div class="foot"><span>${esc(repoUrl)}</span><span class="who">${esc(author)}</span></div>`
    : `<div class="intro">
    <p class="label"><b>Skill Arena</b> &nbsp;·&nbsp; ${esc(round)}</p>
    <h1><span>Same prompt.</span><span>Same agent.</span><span class="l2">${reveal ? revealLine : blindLine}</span></h1>
    <div class="foot"><span class="who">${esc(author)}</span><span>${esc(repoUrl)}</span></div>
  </div>
  <div class="grid">${cards}${note}</div>`}
</div>
</body></html>`;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
}
