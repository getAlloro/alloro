# Anti-Pattern Log

Failures observed in real Alloro sessions. Check this file before building. Do not repeat a logged pattern. Add a new entry when a session uncovers a repeatable failure -- one entry = one pattern, with the fix.

## AP-1 -- Build State drift

**Pattern:** A doc, Notion page, or commit message reports work as done; the code disagrees. The May 14 audit found `.claude/rules/alloro-context.md` reported shipped while the file did not exist.
**Why it's wrong:** Acting on a stale claim builds on a foundation that isn't there.
**Instead:** Code is truth. Verify every "done" claim against the codebase (`git cat-file`, grep, run it) before relying on it. When a doc and the code disagree, fix the doc.

## AP-2 -- Shipping code without wiring (orphaned code)

**Pattern:** A route, service, worker, or component is committed but never mounted, registered, or imported. The May 21 inventory found 57 orphaned features.
**Why it's wrong:** Orphaned code looks shipped, passes TSC, and does nothing. It rots and misleads the next reader.
**Instead:** One feature = one commit = one *verifiable* step. A feature is not done until something references it: a route mount in `src/index.ts`, a `new Worker(...)` in `src/workers/worker.ts`, or an import. Verify the wiring, not just the file.

## AP-3 -- Assuming sub-agents inherit CLAUDE.md

**Pattern:** Sub-agents launched via the Agent tool are expected to inherit CLAUDE.md `@imports` (rules, lattices). They do not.
**Why it's wrong:** The sub-agent runs without the rules, voice constraints, or lattice context the task assumed.
**Instead:** Every sub-agent prompt that needs rule or lattice context must include it inline. Use `scripts/inject-lattice.ts` for lattice content.

## AP-4 -- "Registered" mistaken for "running"

**Pattern:** An agent is in `agentRegistry.ts` and treated as live. But `scheduler.processor.ts` is commented out in `worker.ts`, so ~40 registered agents never auto-fire.
**Why it's wrong:** Registration is not execution. Reporting an agent as operational when nothing schedules it is a false status.
**Instead:** Trace the execution path -- is there an active `new Worker(...)` or cron that actually runs it? If not, it is manual-invocation-only; say so.

## AP-5 -- Leaving superseded files in the tree

**Pattern:** A rebuilt feature lands beside its predecessor with both kept: `DoctorDashboard.tsx` + `DoctorDashboardV1.tsx`, `Help.tsx` + `HelpPage.tsx`, `Compare.tsx` + `ComparePage.tsx`.
**Why it's wrong:** Two files named for the same feature force every future reader to guess which is live, and route shadowing causes silent bugs.
**Instead:** When replacing a file, delete the old one in the same commit, or rename it with an explicit `-deprecated` marker and a removal date.

## AP-6 -- Credentials in committed files

**Pattern:** Putting a real token into a tracked file. `.mcp.json` is committed; its server token values are intentionally blank.
**Why it's wrong:** Any secret in a diff is a leak -- caught or not, it is in history forever.
**Instead:** Real secrets live only in `.env` (gitignored) or shell environment. Committed config references them via `${VAR}` expansion or leaves the value blank.

## AP-7 -- Authoring specs from memory instead of the codebase

**Pattern:** Writing a Dave card that references schema or file paths from recollection. Cards E and G-foundation halted at CC pre-flight because their targets (`practice_profile`, `competitorDiscovery/`) did not exist.
**Why it's wrong:** Intent-based authoring produces specs that contradict reality and fail at the gate.
**Instead:** Before finalizing any card that names a table, column, or path, grep the codebase and check `information_schema`. Cite verified paths and real commits.
