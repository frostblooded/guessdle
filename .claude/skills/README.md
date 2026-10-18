# Skills

Matt Pocock's agent skills, copied unedited from [mattpocock/skills](https://github.com/mattpocock/skills) (MIT, see `LICENSE`).

- Version: `mattpocock-skills` 1.3.1, commit [`49dd158`](https://github.com/mattpocock/skills/tree/49dd158d1076134a641b33efb035946536778336) (2026-10-09).
- Contents: the 27 skills the Claude Code plugin ships (`.claude-plugin/plugin.json`), flattened from `skills/<bucket>/<name>/` to `<name>/`. Not his `in-progress` or `misc` buckets.
- Repo config the skills read: `docs/agents/` (issue tracker, triage labels, domain docs), `GLOSSARY.md`, `docs/adr/`, `CODING_STANDARDS.md`.
- `CLAUDE.md` wins where a skill disagrees with it.
- Prettier skips this folder (`.prettierignore`) so the files stay byte-for-byte upstream.

## Updating

Clone the upstream repo at the new tag, replace each skill folder here with the one listed in its `.claude-plugin/plugin.json`, read the diff (and `CHANGELOG.md`) before committing, and bump the version above. Don't run upstream install scripts.
