import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ARENA_DIR = path.join(ROOT, '.arena');
export const CACHE_DIR = path.join(ARENA_DIR, 'cache');
export const PLUGIN_DIR = path.join(ARENA_DIR, 'plugins');
export const RUNS_DIR = path.join(ROOT, 'runs');
export const SITE_DIR = path.join(ROOT, 'site');

export async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

export async function loadConfig() {
  return readJson(path.join(ROOT, 'arena.config.json'));
}

export async function loadContenders(only) {
  const dir = path.join(ROOT, 'contenders');
  const files = (await readdir(dir)).filter((f) => f.endsWith('.json')).sort();
  const all = await Promise.all(files.map((f) => readJson(path.join(dir, f))));
  // Baseline always comes first so it anchors every comparison.
  all.sort((a, b) => (a.id === 'baseline' ? -1 : b.id === 'baseline' ? 1 : a.id.localeCompare(b.id)));
  return filterById(all, only, 'contender');
}

export function parseFrontmatter(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { data: {}, body: text.trim() };
  const data = {};
  for (const line of match[1].split('\n')) {
    const i = line.indexOf(':');
    if (i > 0) data[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^['"]|['"]$/g, '');
  }
  return { data, body: match[2].trim() };
}

export async function loadPrompts(only) {
  const dir = path.join(ROOT, 'prompts');
  const rules = (await readFile(path.join(dir, '_rules.md'), 'utf8')).trim();
  const files = (await readdir(dir)).filter((f) => f.endsWith('.md') && !f.startsWith('_')).sort();
  const prompts = [];
  for (const f of files) {
    const { data, body } = parseFrontmatter(await readFile(path.join(dir, f), 'utf8'));
    const id = data.id || path.basename(f, '.md');
    prompts.push({ id, title: data.title || id, genre: data.genre || '', brief: body, text: `${body}\n\n${rules}` });
  }
  return filterById(prompts, only, 'prompt');
}

function filterById(items, only, kind) {
  if (!only?.length) return items;
  const unknown = only.filter((id) => !items.some((x) => x.id === id));
  if (unknown.length) throw new Error(`Unknown ${kind}: ${unknown.join(', ')}. Known: ${items.map((x) => x.id).join(', ')}`);
  return items.filter((x) => only.includes(x.id));
}

/** Tiny flag parser: --name value, --name=value, --flag. Comma lists become arrays via list(). */
export function parseArgs(argv = process.argv.slice(2)) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const [k, v] = a.slice(2).split('=');
    if (v !== undefined) args[k] = v;
    else if (argv[i + 1] && !argv[i + 1].startsWith('--')) args[k] = argv[++i];
    else args[k] = true;
  }
  return args;
}

export const list = (v) => (typeof v === 'string' ? v.split(',').map((s) => s.trim()).filter(Boolean) : undefined);

export const LAST_RUN_FILE = path.join(ROOT, 'runs', '.last');

export async function resolveRunId(arg) {
  if (typeof arg === 'string') return arg;
  if (existsSync(LAST_RUN_FILE)) return (await readFile(LAST_RUN_FILE, 'utf8')).trim();
  const ids = existsSync(RUNS_DIR)
    ? (await readdir(RUNS_DIR, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name).sort()
    : [];
  if (!ids.length) throw new Error('No runs yet. Start one with: npm run arena');
  return ids.at(-1);
}

export function cachePath(c) {
  return path.join(CACHE_DIR, `${c.id}@${c.commit.slice(0, 12)}`);
}

export async function pool(items, size, worker) {
  const queue = items.map((item, index) => ({ item, index }));
  const results = [];
  const runners = Array.from({ length: Math.max(1, size) }, async () => {
    while (queue.length) {
      const { item, index } = queue.shift();
      results[index] = await worker(item, index);
    }
  });
  await Promise.all(runners);
  return results;
}

export function stamp(date = new Date()) {
  return date.toISOString().slice(0, 16).replace(/[:T]/g, '-');
}

export const LOGIN_HOME = path.join(ARENA_DIR, 'claude-home');

/**
 * Finds the Claude Code CLI. Shells started by apps or IDEs often lack
 * ~/.local/bin on PATH, so the usual install locations are checked too.
 * Set CLAUDE_BIN to override.
 */
export function claudeBin() {
  if (process.env.CLAUDE_BIN) return process.env.CLAUDE_BIN;
  const home = os.homedir();
  const dirs = [...(process.env.PATH || '').split(path.delimiter), path.join(home, '.local', 'bin'), path.join(home, '.claude', 'local'), '/opt/homebrew/bin', '/usr/local/bin'];
  for (const dir of dirs) {
    const candidate = path.join(dir, 'claude');
    if (dir && existsSync(candidate)) return candidate;
  }
  throw new Error('Claude Code CLI not found. Install it (https://docs.claude.com/en/docs/claude-code) or set CLAUDE_BIN to its path.');
}
