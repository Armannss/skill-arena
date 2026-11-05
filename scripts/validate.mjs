// Checks contender files and prompts. Runs in CI on every pull request.
//
//   node scripts/validate.mjs            check files only (no network)
//   node scripts/validate.mjs --fetch    also clone each contender and check its skill folders
import { readdir, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { ROOT, parseArgs, parseFrontmatter } from './lib.mjs';

const args = parseArgs();
const errors = [];
const fail = (file, msg) => errors.push(`${file}: ${msg}`);

const KNOWN = new Set(['id', 'name', 'author', 'repo', 'commit', 'license', 'skills', 'notes', 'description']);
const dir = path.join(ROOT, 'contenders');
const ids = new Set();
for (const file of (await readdir(dir)).filter((f) => f.endsWith('.json')).sort()) {
  let c;
  try {
    c = JSON.parse(await readFile(path.join(dir, file), 'utf8'));
  } catch (e) {
    fail(file, `not valid JSON (${e.message})`);
    continue;
  }
  const unknown = Object.keys(c).filter((k) => !KNOWN.has(k));
  if (unknown.length) fail(file, `unknown field(s): ${unknown.join(', ')}`);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(c.id ?? '')) fail(file, '"id" must be lowercase letters, digits and dashes');
  if (`${c.id}.json` !== file) fail(file, `file name must be ${c.id}.json`);
  if (ids.has(c.id)) fail(file, `duplicate id "${c.id}"`);
  ids.add(c.id);
  if (typeof c.name !== 'string' || !c.name.trim()) fail(file, '"name" is required');
  if (!Array.isArray(c.skills)) fail(file, '"skills" must be a list');
  if (c.id === 'baseline') {
    if (c.skills?.length || c.repo) fail(file, 'the baseline must have no repo and no skills');
    continue;
  }
  if (!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/.test(c.repo ?? '')) fail(file, '"repo" must look like https://github.com/owner/name');
  if (!/^[0-9a-f]{40}$/.test(c.commit ?? '')) fail(file, '"commit" must be a full 40-character commit sha');
  if (typeof c.author !== 'string' || !c.author.trim()) fail(file, '"author" is required');
  if (typeof c.license !== 'string' || !c.license.trim()) fail(file, '"license" is required (an SPDX id such as MIT)');
  if (!c.skills?.length) fail(file, '"skills" needs at least one folder');
  for (const s of c.skills ?? []) {
    if (typeof s !== 'string' || s.startsWith('/') || s.includes('..')) fail(file, `skill path "${s}" must be relative to the repo root`);
  }
}

const promptDir = path.join(ROOT, 'prompts');
for (const file of (await readdir(promptDir)).filter((f) => f.endsWith('.md') && !f.startsWith('_'))) {
  const { data, body } = parseFrontmatter(await readFile(path.join(promptDir, file), 'utf8'));
  if (!data.id || `${data.id}.md` !== file) fail(`prompts/${file}`, `needs "id: ${path.basename(file, '.md')}" in its front matter`);
  if (!data.title) fail(`prompts/${file}`, 'needs a "title" in its front matter');
  if (body.length < 80) fail(`prompts/${file}`, 'the brief is too short to be useful');
  if (/skill/i.test(body)) fail(`prompts/${file}`, 'a brief must not mention skills, or it would hint the agent');
}

if (errors.length) {
  console.error(`${errors.length} problem${errors.length === 1 ? '' : 's'}:\n- ${errors.join('\n- ')}`);
  process.exit(1);
}
console.log(`Files ok: ${ids.size} contenders.`);

if (args.fetch) {
  // fetch.mjs clones each contender at its pinned commit and fails if a
  // listed folder has no SKILL.md, which is the check that matters here.
  execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'fetch.mjs')], { stdio: 'inherit' });
}
