// Clones every contender at its pinned commit and wraps its skills in a
// Claude Code plugin folder, so a run can load exactly that contender and
// nothing else with --plugin-dir.
import { mkdir, rm, cp, readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { loadContenders, parseArgs, list, cachePath, PLUGIN_DIR, parseFrontmatter } from './lib.mjs';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();

async function clone(c) {
  const dir = cachePath(c);
  if (existsSync(path.join(dir, '.arena-ok'))) return dir;
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  git(dir, 'init', '-q');
  git(dir, 'remote', 'add', 'origin', c.repo);
  git(dir, 'fetch', '-q', '--depth', '1', 'origin', c.commit);
  git(dir, 'checkout', '-q', 'FETCH_HEAD');
  await writeFile(path.join(dir, '.arena-ok'), c.commit);
  return dir;
}

async function expand(repoDir, pattern) {
  if (!pattern.endsWith('/*')) return [path.join(repoDir, pattern)];
  const base = path.join(repoDir, pattern.slice(0, -2));
  const entries = await readdir(base, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => path.join(base, e.name));
}

async function buildPlugin(c, repoDir) {
  const out = path.join(PLUGIN_DIR, c.id);
  await rm(out, { recursive: true, force: true });
  await mkdir(path.join(out, '.claude-plugin'), { recursive: true });
  const skillNames = [];
  for (const pattern of c.skills) {
    for (const src of await expand(repoDir, pattern)) {
      const skillFile = path.join(src, 'SKILL.md');
      if (!existsSync(skillFile)) throw new Error(`${c.id}: no SKILL.md in ${path.relative(repoDir, src)}`);
      const { data } = parseFrontmatter(await readFile(skillFile, 'utf8'));
      const folder = path.basename(src);
      await cp(src, path.join(out, 'skills', folder), { recursive: true, filter: (p) => !p.includes(`${path.sep}.git`) });
      // Claude Code names plugin skills by folder, not by the name in SKILL.md.
      skillNames.push(folder);
    }
  }
  await writeFile(
    path.join(out, '.claude-plugin', 'plugin.json'),
    JSON.stringify({ name: c.id, version: c.commit.slice(0, 7), description: `${c.name} (${c.repo}) for Skill Arena` }, null, 2),
  );
  await writeFile(path.join(out, 'arena.json'), JSON.stringify({ id: c.id, commit: c.commit, skills: skillNames }, null, 2));
  return skillNames;
}

const args = parseArgs();
const contenders = (await loadContenders(list(args.contenders))).filter((c) => c.skills.length);
for (const c of contenders) {
  process.stdout.write(`${c.id.padEnd(14)} ${c.commit.slice(0, 7)}  `);
  const repoDir = await clone(c);
  const names = await buildPlugin(c, repoDir);
  const size = await dirSize(path.join(PLUGIN_DIR, c.id));
  console.log(`${names.length} skill${names.length === 1 ? '' : 's'}, ${(size / 1024).toFixed(0)} KB: ${names.join(', ')}`);
}

async function dirSize(dir) {
  let total = 0;
  for (const e of await readdir(dir, { withFileTypes: true, recursive: true })) {
    if (e.isFile()) total += (await stat(path.join(e.parentPath ?? e.path, e.name))).size;
  }
  return total;
}
