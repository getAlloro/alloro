# Alloro — Claude Code Instructions

The repo-local operating notes for this project live in [`AGENTS.md`](AGENTS.md) — deployment path, server/paths, migration safety, Feature Friyays, docs parity, and the Code Constitution mandate. Read and follow them:

@AGENTS.md

## Code Constitution (mandatory)

All code work in this repo follows the **Code Constitution** — the numbered architecture contract for backend (`src/`) and frontend (`frontend/`), with stable `§N.M` Article IDs.

During `--start` (`-s`) and any execution mode (`-x`, `-i`, `-q`), **invoke the `code-constitution` skill**:

- **Planning (`-s`):** cite the `§N.M` Articles the work touches in the spec's Context/Constraints, and name the reference analog (`§6.1` `src/controllers/gbp-automation/` for backend, `§12.1` the `frontend/src/api/` triad for frontend).
- **Execution:** conform to the cited Articles, then verify with `npm run check:all` (backend CI gate: `npm run check:conventions --strict`), citing `§N.M` for every violation. Fix must-fix violations before reporting done; frontend mechanized Articles are advisory until the frontend remediation lands.

The full contract is at `~/.claude/skills/code-constitution/SKILL.md`; a browsable view is in [`code-constitution.html`](code-constitution.html).
