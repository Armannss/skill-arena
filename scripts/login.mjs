// Signs the arena in with a Claude subscription. The sign-in lives in
// .arena/claude-home, apart from your own Claude Code setup, so your
// skills, plugins and CLAUDE.md never reach the runs.
//
//   npm run login            sign in
//   npm run login -- status  show the current sign-in
import { mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { LOGIN_HOME, claudeBin } from './lib.mjs';

await mkdir(LOGIN_HOME, { recursive: true });
const sub = process.argv[2] === 'status' ? 'status' : 'login';
const { status } = spawnSync(claudeBin(), ['auth', sub], {
  stdio: 'inherit',
  env: { ...process.env, CLAUDE_CONFIG_DIR: LOGIN_HOME },
});
process.exit(status ?? 1);
