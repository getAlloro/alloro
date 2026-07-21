# Alloro — Claude Code Instructions

The repo-local operating notes for this project live in [`AGENTS.md`](AGENTS.md) — deployment path, server/paths, migration safety, Feature Friyays, docs parity, and the Code Constitution mandate. Read and follow them:

@AGENTS.md

## Global Workflow Commands

The global command contract in `~/.claude/CLAUDE.md` applies here:

- `--start` / `-s` creates a new linked worktree from the current branch's committed `HEAD` before planning, unless the user explicitly passes `--no-worktree`.
- `--test-worktree` / `-tw` runs contained acceptance only from a verified secondary linked worktree and only through a repository-owned safe adapter.

Read the Alloro-specific worktree root and runtime safety rules in `AGENTS.md`. The command contract does not mean the Alloro runtime adapter already exists; `-tw` must refuse safely until the adapter is present.

## Code Constitution (mandatory)

All code work in this repo follows the **Code Constitution** — the numbered architecture contract for backend (`src/`) and frontend (`frontend/`), with stable `§N.M` Article IDs.

During `--start` (`-s`) and any execution mode (`-x`, `-i`, `-q`), **invoke the `code-constitution` skill**:

- **Planning (`-s`):** cite the `§N.M` Articles the work touches in the spec's Context/Constraints, and name the reference analog (`§6.1` `src/controllers/gbp-automation/` for backend, `§12.1` the `frontend/src/api/` triad for frontend).
- **Execution:** conform to the cited Articles, then verify with `npm run check:all` (backend CI gate: `npm run check:conventions --strict`), citing `§N.M` for every violation. Fix must-fix violations before reporting done; frontend mechanized Articles are advisory until the frontend remediation lands.

The full contract is at `~/.claude/skills/code-constitution/SKILL.md`; a browsable view is in [`code-constitution.html`](code-constitution.html).

## PR Pipeline Protocol

Before any PR work, read docs/pr-pipeline-protocol.md and comply with its active rules. Every plan file must contain an acceptance block (numbered behavioral items plus predicted signals) before code is written, and PR bodies may only claim what a passing acceptance item proved.
Before removing or bypassing any existing check, filter, or config, state its inferred purpose in the session log first.
