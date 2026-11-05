// Moves each contender's pinned commit to the tip of its default branch.
// Run it before a new round, then commit the changed contender files.
import { writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { loadContenders, parseArgs, list, ROOT } from './lib.mjs';

const args = parseArgs();
for (const c of await loadContenders(list(args.contenders))) {
  if (!c.repo) continue;
  const head = execFileSync('git', ['ls-remote', c.repo, 'HEAD']).toString().split('\t')[0];
  if (head === c.commit) {
    console.log(`${c.id.padEnd(14)} up to date`);
    continue;
  }
  console.log(`${c.id.padEnd(14)} ${c.commit.slice(0, 7)} -> ${head.slice(0, 7)}`);
  const { id, ...rest } = c;
  await writeFile(path.join(ROOT, 'contenders', `${id}.json`), JSON.stringify({ id, ...rest, commit: head }, null, 2) + '\n');
}
