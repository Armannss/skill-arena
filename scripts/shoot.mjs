// Screenshots every page a run produced, at desktop and phone width.
// Uses the Chrome installed on the machine (or CHROME_PATH).
//
//   node scripts/shoot.mjs [--run name] [--force]
import { readdir, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { loadConfig, parseArgs, resolveRunId, readJson, RUNS_DIR } from './lib.mjs';

const args = parseArgs();
const config = await loadConfig();
const runId = await resolveRunId(args.run);
const runDir = path.join(RUNS_DIR, runId);
const MAX_FULL_HEIGHT = 9000;

const targets = [];
for (const prompt of await dirs(runDir)) {
  for (const contender of await dirs(path.join(runDir, prompt))) {
    for (const seed of await dirs(path.join(runDir, prompt, contender))) {
      const dir = path.join(runDir, prompt, contender, seed);
      if (existsSync(path.join(dir, 'work', 'index.html'))) targets.push(dir);
    }
  }
}
if (!targets.length) {
  console.error(`No pages to shoot in runs/${runId}.`);
  process.exit(1);
}

const browser = await chromium.launch(
  process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' },
);

for (const dir of targets) {
  const shots = path.join(dir, 'shots');
  const label = path.relative(runDir, dir);
  if (!args.force && existsSync(path.join(shots, 'mobile-full.jpg'))) {
    console.log(`skip ${label}`);
    continue;
  }
  const errors = [];
  for (const [name, viewport] of Object.entries(config.viewports)) {
    const context = await browser.newContext({
      viewport,
      deviceScaleFactor: name === 'mobile' ? 2 : 1,
      isMobile: name === 'mobile',
      hasTouch: name === 'mobile',
    });
    // Pages may only use local files and public CDNs; everything else is
    // blocked so a page cannot phone home while it is being judged.
    await context.route('**/*', (route) => {
      const url = route.request().url();
      if (url.startsWith('file:') || url.startsWith('data:') || url.startsWith('blob:') || /^https:\/\/(fonts\.(googleapis|gstatic)\.com|cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com|esm\.sh|cdn\.tailwindcss\.com|rsms\.me|api\.fontshare\.com|cdn\.fontshare\.com)\//.test(url)) return route.continue();
      return route.abort();
    });
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
    await page.goto(pathToFileURL(path.join(dir, 'work', 'index.html')).href, { waitUntil: 'load', timeout: 30_000 }).catch((e) => errors.push(`${name}: ${e.message}`));
    await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {});
    await settle(page);
    await page.screenshot({ path: path.join(shots, `${name}-fold.jpg`), type: 'jpeg', quality: 85 });
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.screenshot({
      path: path.join(shots, `${name}-full.jpg`),
      type: 'jpeg',
      quality: 80,
      fullPage: height <= MAX_FULL_HEIGHT,
      clip: height > MAX_FULL_HEIGHT ? { x: 0, y: 0, width: viewport.width, height: MAX_FULL_HEIGHT } : undefined,
    });
    await context.close();
  }
  const meta = existsSync(path.join(dir, 'meta.json')) ? await readJson(path.join(dir, 'meta.json')) : {};
  meta.pageErrors = errors;
  await writeFile(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2));
  console.log(`shot ${label}${errors.length ? `  (${errors.length} page error${errors.length === 1 ? '' : 's'})` : ''}`);
}
await browser.close();

// Scroll through the page once so scroll-triggered reveals and lazy images
// have fired, then return to the top for the capture.
async function settle(page) {
  await page.evaluate(async () => {
    const step = Math.max(200, Math.floor(window.innerHeight * 0.8));
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 120));
    }
    window.scrollTo(0, 0);
  }).catch(() => {});
  await page.evaluate(() => document.fonts?.ready).catch(() => {});
  await page.waitForTimeout(1200);
}

async function dirs(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of (await readdir(dir)).sort()) {
    if ((await stat(path.join(dir, name))).isDirectory()) out.push(name);
  }
  return out;
}
