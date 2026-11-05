# Contributing

Thanks for helping. The three most useful contributions are new contenders, new briefs and fixes to the method.

## Add a skill (a contender)

1. Fork this repo.
2. Add `contenders/<id>.json`:

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

   - `id` is lowercase with dashes, and the file is named after it.
   - `commit` pins the exact version to test. Use a full sha, not a branch name.
   - `skills` lists folders in your repo that contain a `SKILL.md`. A path ending in `/*` includes every folder below it.
   - Use `notes` for anything the arena does not install, such as a hook or a CLI.

3. Check it locally:

   ```bash
   npm install
   node scripts/validate.mjs --fetch
   ```

4. Open a pull request. CI runs the same check.

Your skill joins the next round. Rounds are run by the maintainer, because they cost money and must use the same agent version for every contender.

The arena never redistributes your skill. It is cloned from your repo at the pinned commit when someone runs it.

## Add a brief

Add `prompts/<id>.md` with `id`, `title` and `genre` in the front matter, then the brief.

A good brief:
- describes a real product and what the page must achieve, in a short paragraph
- never mentions skills, design systems or tools, so it gives no hints
- is something a person would actually ask an agent to build

`prompts/_rules.md` is added to every brief, so you do not repeat delivery rules.

## Run it yourself

See [Run it yourself](README.md#run-it-yourself) in the README. Please run untrusted contenders in `safe` mode, or in a container if you use `full`.

## Report a problem with the method

If you think a result is unfair, open an issue with the run name, the contender and what you expected. Transcripts for every run are in the gallery, so link the one you mean.
