# caveman (vendored)

Source: https://github.com/JuliusBrussee/caveman, by Julius Brussee. Apache-2.0 (see LICENSE, NOTICE).
Version: 4.0.1, commit bad48a0e1df55e05e3f52249afa35ecc1909ee76 (2026-10-17).

Copied unedited:

- `src/hooks/*.js` and `src/hooks/package.json` into this folder, minus `caveman-host-session-start.js` (other agent hosts only).
- `skills/{caveman,ultracave,megacave,caveman-help,caveman-stats}/SKILL.md` into `.claude/skills/`.

Left out: the Caveman Cloud skills (they send data to the hosted service), `caveman-compress` (runs Python), `caveman-commit` and `caveman-review` (would override this repo's commit and review conventions), `cavecrew` and its agents, the workflow skills, the statusline scripts and the install scripts.

The hooks are wired in `.claude/settings.json` (SessionStart, SubagentStart, UserPromptSubmit, SessionEnd). Turn it off for a session with "stop caveman".

To update: clone the repo at the new version and copy the same files over, then check that the hook entries in `plugin.json` still match `.claude/settings.json`.
