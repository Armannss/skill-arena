# Skill Arena

**Same prompt. Same agent. Different design skill.**

By [Arman Naseri Far](https://armannss.github.io/portfolio/).

Design skills for coding agents are everywhere: Impeccable, Taste Skill, Hallmark, Interfaces and more. Each promises to stop your agent from shipping generic AI-looking pages. Skill Arena checks that claim. It gives one agent the same brief several times, changing only which skill is installed, then puts the results side by side so you can judge them blind.

> **Results:** the first round is coming. The gallery will be published at this repo's GitHub Pages URL.

## What a round looks like

| | |
|---|---|
| **Agent** | Claude Code in headless mode, one fixed model and effort level |
| **Contenders** | No skill (baseline), plus every skill in [`contenders/`](contenders) |
| **Briefs** | A SaaS landing page, an analytics dashboard, a restaurant site and a designer portfolio ([`prompts/`](prompts)) |
| **Seeds** | Every brief runs several times per contender, because agents are not deterministic |
| **Output** | Desktop and phone screenshots, the live page, the full agent transcript, time, cost and whether the skill was actually used |

## Keeping it fair

- **Pinned versions.** Each contender is cloned at the commit in its JSON file, so results are tied to an exact version of the skill.
- **One contender per run.** Its skills are loaded as a plugin with `--plugin-dir`. Nothing else is installed.
- **No leaks from the host machine.** The agent runs in an empty folder under the system temp directory. With an API key it runs with `--bare`, which skips user settings, plugins, hooks, memory and CLAUDE.md. With a subscription sign-in it uses a private config folder that holds only the arena's sign-in.
- **No hints.** The brief never names a skill. A skill has to trigger by itself, as it would for a real user. The scoreboard reports how often each one did.
- **Blind judging.** The gallery has a blind mode that shuffles entries and hides names until you reveal them.
- **Same capture for everyone.** Chrome at 1440 and 390 pixels wide, after one scroll through the page so scroll animations have played. Requests to anything except local files and a short list of public CDNs are blocked.

## Run it yourself

You need Node 20+, Git, Google Chrome and [Claude Code](https://docs.claude.com/en/docs/claude-code).

```bash
npm install
npm run fetch        # clone every contender at its pinned commit
```

Sign in, one of two ways:

```bash
export ANTHROPIC_API_KEY=...   # recommended: runs in --bare mode
npm run login                  # or use a Claude subscription, kept in .arena/claude-home
```

Then run a small round first to check the cost:

```bash
npm run run -- --prompts saas-landing --seeds 1
npm run shoot
npm run gallery
open site/index.html
```

A full round is `npm run arena`. It runs fetch, run, shoot and gallery in order.

Useful flags for `npm run run --`:

| Flag | Meaning |
|---|---|
| `--prompts a,b` | Only these briefs |
| `--contenders x,y` | Only these contenders |
| `--seeds 3` | Runs per brief and contender |
| `--concurrency 2` | Parallel agent runs |
| `--run name` | Name the run folder instead of using a timestamp |
| `--mode safe\|full` | Override the mode from the config (see below) |
| `--dry-run` | Print the commands without calling the agent |

The model, effort level, timeout and viewports are set in [`arena.config.json`](arena.config.json).

### Safe mode and full mode

| Mode | What the agent can do | Use it |
|---|---|---|
| `safe` (default) | Read, write and edit files and load skills. No shell, so nothing a skill ships can execute. Everything else is denied. | Anywhere |
| `full` | Every tool, with permission checks turned off, so skills can run their own scripts such as browser checks and linters | Only inside a container or a throwaway VM |

Set the mode in `arena.config.json` or per run with `--mode full`. Some skills do more in full mode, so a round's gallery shows which mode it used, and results from different modes should not be compared.

## Add a skill

Open a pull request that adds one file to `contenders/`:

```json
{
  "id": "my-skill",
  "name": "My Skill",
  "author": "your-github-name",
  "repo": "https://github.com/you/my-skill",
  "commit": "full 40-character commit sha",
  "license": "MIT",
  "skills": ["skills/my-skill"]
}
```

`skills` lists folders inside the repo that contain a `SKILL.md`. A path ending in `/*` includes every folder below it. Use `notes` for anything the arena does not install, such as hooks or a CLI.

`npm run pin` moves every contender to the latest commit of its default branch, before a new round.

## Repository layout

```
contenders/        one JSON file per contender
prompts/           the briefs, plus _rules.md that is added to every brief
arena.config.json  agent, model, seeds and viewports
scripts/           fetch, pin, run, shoot and gallery
runs/              raw results per run (not committed)
site/              the generated gallery (deploy this folder)
```

## Limits

- Results come from one agent and one model. A skill can rank differently with another agent.
- Some contenders ship extra pieces, like hooks or command-line tools. The arena tests the skill files only, and each contender file says what it leaves out.
- Taste is subjective. The arena shows its evidence so you can judge for yourself.

## Author

Skill Arena is made by **Arman Naseri Far** to find out which design skills actually change what coding agents build.

- Portfolio: [armannss.github.io/portfolio](https://armannss.github.io/portfolio/)
- LinkedIn: [Arman Naseri Far](https://www.linkedin.com/in/arman-naseri-far-5773b3341/)
- GitHub: [@Armannss](https://github.com/Armannss)

Ideas, new briefs and new contenders are welcome as issues or pull requests.

## License

The arena code is MIT, copyright Arman Naseri Far. Contender skills are not included in this repository. They are downloaded from their own repositories when you run `npm run fetch` and keep their own licenses.
