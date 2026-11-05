// Publishes site/ to the gh-pages branch, which GitHub Pages serves.
// Build the gallery and posters first (npm run gallery, npm run poster).
//
//   node scripts/publish.mjs              commit and push gh-pages
//   node scripts/publish.mjs --no-push    commit locally only, to check
import { readdir, rm, cp, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { ARENA_DIR, ROOT, SITE_DIR, parseArgs, readJson } from './lib.mjs';

const args = parseArgs();
const BRANCH = 'gh-pages';
const tree = path.join(ARENA_DIR, 'gh-pages');
const git = (cwd, ...a) => execFileSync('git', a, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();

if (!existsSync(path.join(SITE_DIR, 'index.html'))) {
  console.error('No gallery to publish. Run: npm run gallery && npm run poster');
  process.exit(1);
}

if (!existsSync(path.join(tree, '.git'))) {
  git(ROOT, 'worktree', 'prune');
  const remote = git(ROOT, 'ls-remote', '--heads', 'origin', BRANCH);
  if (remote) {
    git(ROOT, 'fetch', '-q', 'origin', `${BRANCH}:${BRANCH}`);
    git(ROOT, 'worktree', 'add', '-q', tree, BRANCH);
  } else if (git(ROOT, 'branch', '--list', BRANCH)) {
    git(ROOT, 'worktree', 'add', '-q', tree, BRANCH);
  } else {
    // A branch with no history of its own: only the built site lives there.
    git(ROOT, 'worktree', 'add', '-q', '--detach', tree);
    git(tree, 'checkout', '-q', '--orphan', BRANCH);
    git(tree, 'rm', '-rfq', '.');
  }
}

for (const name of await readdir(tree)) {
  if (name !== '.git') await rm(path.join(tree, name), { recursive: true, force: true });
}
await cp(SITE_DIR, tree, { recursive: true });
await writeFile(path.join(tree, '.nojekyll'), '');

git(tree, 'add', '-A');
if (!git(tree, 'status', '--porcelain')) {
  console.log('Nothing changed since the last publish.');
  process.exit(0);
}
const run = await readJson(path.join(SITE_DIR, 'run.json')).catch(() => null);
git(tree, 'commit', '-q', '-m', `Publish gallery${run?.id ? ` for run ${run.id}` : ''}`);
console.log(`Committed to ${BRANCH}: ${git(tree, 'log', '-1', '--format=%h %s')}`);

if (args['no-push']) {
  console.log('Not pushed (--no-push).');
  process.exit(0);
}
execFileSync('git', ['push', '-u', 'origin', BRANCH], { cwd: tree, stdio: 'inherit' });
const pkg = await readJson(path.join(ROOT, 'package.json'));
console.log(`\nPushed. If Pages is not on yet: repo Settings > Pages > Deploy from a branch > ${BRANCH} / root.\nThe gallery will be at ${pkg.homepage}`);
