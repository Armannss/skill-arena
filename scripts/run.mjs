// Runs every prompt x contender x seed through Claude Code in headless mode.
// Each run gets an empty folder, the contender's skills and nothing else.
//
//   node scripts/run.mjs [--prompts a,b] [--contenders x,y] [--seeds 3] [--run name]
//                        [--concurrency 2] [--auth api|login] [--mode safe|full]
//                        [--check] [--dry-run]
import { mkdir, writeFile, mkdtemp, cp, rm } from 'node:fs/promises';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { createWriteStream, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import {
  loadConfig, loadContenders, loadPrompts, parseArgs, list, pool, stamp, readJson,
  PLUGIN_DIR, RUNS_DIR, LAST_RUN_FILE, LOGIN_HOME, claudeBin,
} from './lib.mjs';

const args = parseArgs();
const config = await loadConfig();
const prompts = await loadPrompts(list(args.prompts));
const contenders = await loadContenders(list(args.contenders));
const seeds = Number(args.seeds ?? config.seeds ?? 1);
const runId = typeof args.run === 'string' ? args.run : stamp();
const auth = args.auth ?? (process.env.ANTHROPIC_API_KEY ? 'api' : 'login');
const agent = { mode: 'safe', ...config.agent };
if (args.mode) agent.mode = args.mode;
if (!['safe', 'full'].includes(agent.mode)) throw new Error(`Unknown mode "${agent.mode}". Use safe or full.`);

// safe: the agent can only read, write and edit files and load skills. No
//       shell, so nothing a skill ships can execute. Anything else is denied.
// full: every tool and no permission checks, so skills can run their own
//       scripts (browser checks, linters). Only inside a container or VM.
const SAFE_TOOLS = ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Skill'];

// Isolation. Without it, the skills, plugins and CLAUDE.md on the machine
// running the arena, and the skills and plugins synced from the signed-in
// account, would leak into every run, the baseline included.
//   api:   --bare skips user settings, plugins, hooks, CLAUDE.md and memory.
//   login: a private config folder that holds only the arena's own sign-in,
//          and --setting-sources project, which keeps account-synced skills
//          and plugins out.
//   both:  bundled skills are turned off, and a preflight finds any skill
//          that is still loaded and turns it off with skillOverrides.
// Every run then records the skills it actually saw, so a leak shows up.
const CLAUDE = claudeBin();
if (auth === 'login' && !args['dry-run'] && !existsSync(LOGIN_HOME)) {
  console.error('No ANTHROPIC_API_KEY and no arena sign-in yet. Either export ANTHROPIC_API_KEY, or run once:\n\n  npm run login\n');
  process.exit(1);
}

for (const c of contenders) {
  if (c.skills.length && !existsSync(path.join(PLUGIN_DIR, c.id, 'arena.json'))) {
    console.error(`Skills for "${c.id}" are not fetched yet. Run: npm run fetch`);
    process.exit(1);
  }
}

const skillOverrides = args['dry-run'] ? {} : await preflight();
if (args.check) process.exit(0);

const jobs = [];
for (const p of prompts) for (const c of contenders) for (let s = 1; s <= seeds; s++) jobs.push({ p, c, seed: s });

const runDir = path.join(RUNS_DIR, runId);
await mkdir(runDir, { recursive: true });
if (!args['dry-run']) await writeFile(LAST_RUN_FILE, runId);
await writeFile(
  path.join(runDir, 'run.json'),
  JSON.stringify({
    id: runId,
    startedAt: new Date().toISOString(),
    agent: { name: 'claude-code', version: await cliVersion(), ...agent },
    auth,
    disabledSkills: Object.keys(skillOverrides),
    seeds,
    prompts: prompts.map(({ id, title, genre, brief }) => ({ id, title, genre, brief })),
    contenders: contenders.map(({ id, name, author, repo, commit, license, notes, description }) =>
      ({ id, name, author, repo, commit, license, notes, description })),
  }, null, 2),
);

console.log(`Run ${runId}: ${prompts.length} prompts x ${contenders.length} contenders x ${seeds} seeds = ${jobs.length} runs (auth: ${auth}, mode: ${agent.mode})\n`);

let done = 0;
await pool(jobs, Number(args.concurrency ?? config.concurrency ?? 1), async (job) => {
  const label = `${job.p.id} / ${job.c.id} / seed ${job.seed}`;
  const meta = await runOne(job);
  done++;
  const status = meta.ok ? 'ok ' : 'ERR';
  const used = job.c.skills.length ? (meta.skillTriggered ? 'skill used' : 'skill NOT used') : '';
  const leak = meta.isolated === false ? `  LEAK: ${meta.foreignSkills.join(', ')}` : '';
  console.log(`[${String(done).padStart(String(jobs.length).length)}/${jobs.length}] ${status} ${label.padEnd(44)} ${fmtMin(meta.durationMs)}  $${(meta.costUsd ?? 0).toFixed(2)}  ${used}${leak}`);
});

console.log(`\nDone. Next: npm run shoot && npm run gallery`);

async function runOne({ p, c, seed }) {
  const dir = path.join(runDir, p.id, c.id, `seed-${seed}`);
  const kept = path.join(dir, 'work');
  await mkdir(dir, { recursive: true });
  // The agent works in a fresh folder under the system temp dir, its own git
  // root, so no CLAUDE.md or project settings from parent folders can reach it.
  const work = await mkdtemp(path.join(os.tmpdir(), 'skill-arena-'));
  execFileSync('git', ['init', '-q'], { cwd: work });

  const { cliArgs, env } = agentCommand(p.text, c, skillOverrides);
  cliArgs.push('--model', agent.model);
  if (agent.effort) cliArgs.push('--effort', agent.effort);
  if (agent.mode === 'safe') {
    cliArgs.push('--tools', SAFE_TOOLS.join(','), '--allowed-tools', SAFE_TOOLS.join(','), '--permission-mode', 'dontAsk');
  } else {
    cliArgs.push('--dangerously-skip-permissions');
    if (agent.disallowedTools?.length) cliArgs.push('--disallowed-tools', agent.disallowedTools.join(','));
  }

  if (args['dry-run']) {
    console.log(`claude ${cliArgs.map((a) => (a === p.text ? JSON.stringify(a.slice(0, 40) + '...') : a)).join(' ')}\n  cwd: ${work}`);
    await rm(work, { recursive: true, force: true });
    return { ok: true, durationMs: 0 };
  }

  const started = Date.now();
  const transcript = createWriteStream(path.join(dir, 'transcript.jsonl'));
  const stderr = createWriteStream(path.join(dir, 'stderr.log'));
  const skillCalls = [];
  let loadedSkills = null;
  let result = null;
  let buffer = '';

  const exitCode = await new Promise((resolve) => {
    const child = spawn(CLAUDE, cliArgs, { cwd: work, env, stdio: ['ignore', 'pipe', 'pipe'] });
    const timer = setTimeout(() => child.kill('SIGTERM'), (agent.timeoutMinutes ?? 30) * 60_000);
    child.stdout.on('data', (chunk) => {
      transcript.write(chunk);
      buffer += chunk;
      let nl;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        inspect(line);
      }
    });
    child.stderr.pipe(stderr);
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (buffer) inspect(buffer);
      resolve(signal ? `killed (${signal})` : code);
    });
  });
  transcript.end();
  stderr.end();
  await rm(kept, { recursive: true, force: true });
  await cp(work, kept, { recursive: true, filter: (f) => !f.split(path.sep).includes('.git') && !f.split(path.sep).includes('node_modules') });
  await rm(work, { recursive: true, force: true });

  function inspect(line) {
    let event;
    try { event = JSON.parse(line); } catch { return; }
    if (event.type === 'assistant') {
      for (const block of event.message?.content ?? []) {
        if (block.type === 'tool_use' && block.name === 'Skill') skillCalls.push(block.input?.skill ?? block.input?.name ?? '?');
      }
    }
    if (event.type === 'system' && event.subtype === 'init') loadedSkills = event.skills ?? [];
    if (event.type === 'result') result = event;
  }

  const ownSkills = c.skills.length ? (await readJson(path.join(PLUGIN_DIR, c.id, 'arena.json'))).skills : [];
  const meta = {
    prompt: p.id,
    contender: c.id,
    seed,
    ok: exitCode === 0 && !result?.is_error && existsSync(path.join(kept, 'index.html')),
    exitCode,
    hasIndex: existsSync(path.join(kept, 'index.html')),
    durationMs: Date.now() - started,
    costUsd: result?.total_cost_usd ?? null,
    turns: result?.num_turns ?? null,
    usage: result?.usage ?? null,
    skillCalls,
    skillTriggered: skillCalls.some((s) => ownSkills.includes(s.split(':').at(-1))),
    loadedSkills,
    foreignSkills: (loadedSkills ?? []).filter((s) => !(s.startsWith(`${c.id}:`) && ownSkills.includes(s.split(':').at(-1)))),
    finalMessage: typeof result?.result === 'string' ? result.result.slice(0, 2000) : null,
  };
  meta.isolated = loadedSkills !== null && meta.foreignSkills.length === 0;
  await writeFile(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2));
  return meta;
}

/** The isolation flags and environment shared by real runs and the preflight. */
function agentCommand(promptText, c, overrides) {
  const cliArgs = [
    '-p', promptText,
    '--output-format', 'stream-json', '--verbose',
    '--no-session-persistence',
    '--strict-mcp-config',
    '--no-chrome',
  ];
  if (c?.skills.length) cliArgs.push('--plugin-dir', path.join(PLUGIN_DIR, c.id));
  if (Object.keys(overrides).length) cliArgs.push('--settings', JSON.stringify({ skillOverrides: overrides }));
  const env = { ...process.env, CLAUDE_CODE_DISABLE_BUNDLED_SKILLS: '1' };
  if (auth === 'api') cliArgs.push('--bare');
  else {
    cliArgs.push('--setting-sources', 'project');
    env.CLAUDE_CONFIG_DIR = LOGIN_HOME;
    delete env.ANTHROPIC_API_KEY;
  }
  return { cliArgs, env };
}

/** Lists the skills a run without any contender sees. Costs one tiny call. */
async function probeSkills(overrides) {
  const work = await mkdtemp(path.join(os.tmpdir(), 'skill-arena-probe-'));
  execFileSync('git', ['init', '-q'], { cwd: work });
  const { cliArgs, env } = agentCommand('Reply with the single word OK.', null, overrides);
  cliArgs.push('--model', 'haiku', '--tools', '', '--permission-mode', 'dontAsk');
  const out = await new Promise((resolve, reject) => {
    const child = spawn(CLAUDE, cliArgs, { cwd: work, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let text = '';
    let err = '';
    child.stdout.on('data', (d) => (text += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('close', (code) => (code === 0 ? resolve(text) : reject(new Error(`Preflight failed (${code}): ${err || text}`.slice(0, 800)))));
  });
  await rm(work, { recursive: true, force: true });
  for (const line of out.split('\n')) {
    try {
      const e = JSON.parse(line);
      if (e.type === 'system' && e.subtype === 'init') return e.skills ?? [];
    } catch {}
  }
  throw new Error('Preflight could not read the skill list from Claude Code.');
}

async function preflight() {
  process.stdout.write('Preflight: checking that runs are isolated... ');
  const leftover = await probeSkills({});
  const overrides = Object.fromEntries(leftover.map((s) => [s, 'off']));
  const still = leftover.length ? await probeSkills(overrides) : [];
  if (still.length) {
    console.error(`\nThese skills still load and cannot be turned off: ${still.join(', ')}.\nResults would not be clean, so the run stops here.`);
    process.exit(1);
  }
  console.log(leftover.length ? `ok, turned off ${leftover.length} built-in skill${leftover.length === 1 ? '' : 's'} (${leftover.join(', ')})` : 'ok');
  return overrides;
}

async function cliVersion() {
  return new Promise((resolve) => {
    const child = spawn(CLAUDE, ['--version']);
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.on('close', () => resolve(out.trim().split(' ')[0] || 'unknown'));
    child.on('error', () => resolve('not installed'));
  });
}

function fmtMin(ms) {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s`;
}
