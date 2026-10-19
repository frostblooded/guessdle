# ponytail (vendored)

Source: https://github.com/DietrichGebert/ponytail, by Dietrich Gebert. MIT (see LICENSE).
Version: 5.3.2, commit 09c434ab73ca43761c5d8b0c5d341926c2fba710 (2026-10-18).

Copied unedited:

- `hooks/*.js` and the root `package.json` (it keeps the hooks CommonJS) into this folder.
- `skills/{ponytail,ponytail-help,ponytail-debt,ponytail-gain,ponytail-audit}/SKILL.md` into `.claude/skills/`.

`ponytail-audit` was added on 2026-10-19 at the maintainer's request; it is a whole-repo audit, while PR reviews still follow `CODING_STANDARDS.md`.

Left out: `ponytail-review` (would override `CODING_STANDARDS.md` reviews), the task-board band module, the statusline scripts, and the other agent hosts' files.

The hooks are wired in `.claude/settings.json` (SessionStart, SubagentStart, UserPromptSubmit). Turn it off for a session with "stop ponytail", or change level with `/ponytail lite|full|ultra`.

To update: clone the repo at the new version and copy the same files over, then check that `hooks/claude-codex-hooks.json` still matches `.claude/settings.json`.
