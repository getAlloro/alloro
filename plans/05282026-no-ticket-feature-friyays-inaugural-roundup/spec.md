# Feature Friyays Inaugural Roundup

## Why
Feature Friyays need a repeatable weekly artifact so shipped work can become documentation, release copy, and user-facing email without relying on memory.

## What
Populate `friyays/05-25-2026/` with the first weekly roundup for Thursday, May 21, 2026 through Sunday, May 31, 2026, and update agent instructions so `--done friyay` explicitly adds completed work to the weekly folder.

## Context

**Relevant files:**
- `AGENTS.md` - Alloro-local workflow rules.
- `/Users/rustinedave/.codex/AGENTS.md` - global command behavior for `--done`.
- `friyays/05-25-2026/*` - inaugural Feature Friyay artifacts.
- `CHANGELOG.md` - shipped feature source of truth.

**Patterns to follow:**
- Existing Alloro `AGENTS.md` process notes: direct rules, deployment-state separation, docs parity.
- Existing changelog entries: customer-readable feature summaries backed by file/plan refs.

## Constraints

**Must:**
- Preserve the Monday-named folder convention.
- Keep production, dev, pushed, and unverified states distinct.
- List uncertain but meaningful items in the inventory instead of hiding them.
- Keep customer email copy free of internal-only implementation detail.

**Must not:**
- Claim production release for dev-only items.
- Include unrelated code changes.
- Add a new app dependency or runtime code.

**Out of scope:**
- Deploying any feature.
- Rewriting the changelog.
- Updating Alloro Docs content for specific features in this pass.

## Risk

**Level:** 2

**Risks identified:**
- Weekly copy can overstate release state if dev-only commits are treated as production shipped. **Mitigation:** inventory tracks production, dev, and needs-verification states separately.
- The email can become noisy if every internal fix is promoted to customers. **Mitigation:** inventory includes broad items; email includes only customer-value highlights.

**Blast radius:** Markdown workflow artifacts only.

**Pushback:**
- Do not make Friyay a second changelog. Future-us will hate reconciling two competing sources. The Friyay inventory should reference changelog/git evidence, then translate it for docs/email.

## Tasks

### T1: Agent rule update
**Do:** Update local/global agent instructions for `--done friyay`, inferred Friyay inclusion, and ask-when-unsure behavior.
**Files:** `AGENTS.md`, `/Users/rustinedave/.codex/AGENTS.md`
**Depends on:** none
**Verify:** `rg -n "done friyay|Feature Friyays" AGENTS.md /Users/rustinedave/.codex/AGENTS.md`

### T2: Inaugural Friyay population
**Do:** Populate inventory, documentation, email draft, and checklist using changelog, git history, plan folders, and workflow evidence.
**Files:** `friyays/05-25-2026/index.html`, `friyays/05-25-2026/email.html`, `friyays/05-25-2026/styles.css`
**Depends on:** T1
**Verify:** `rg -n "Needs verification|Production workflow succeeded|Dev workflow succeeded|Subject" friyays/05-25-2026`

## Done
- [x] Friyay folder contains populated inventory, documentation, email, and checklist.
- [x] `--done friyay` behavior is documented.
- [x] Plain `--done` inference/ask behavior is documented.
- [x] Touched Markdown has no trailing whitespace.
- [x] No unrelated working-tree changes are modified.
- [x] Weekly folder uses static `index.html`, `email.html`, and `styles.css` artifacts.
- [x] Old standalone Friyay Markdown artifacts are removed from the weekly folder.

## Revision Log

### Rev 1 - May 28, 2026
**Change:** Convert weekly Friyay artifacts from Markdown files to static branded HTML/CSS.
**Reason:** Friyays should be presentable and shareable with Alloro branding instead of living as plain Markdown drafts.
**Updated Done criteria:** Weekly folder uses `index.html`, `email.html`, and `styles.css`; old standalone Markdown artifacts are removed from the weekly folder.

### T3: Static HTML/CSS Friyay Package
**Do:** Replace Markdown Friyay artifacts with a branded static HTML page, branded email HTML, and shared CSS using Alloro navy/orange/teal styling.
**Files:** `AGENTS.md`, `friyays/05-25-2026/index.html`, `friyays/05-25-2026/email.html`, `friyays/05-25-2026/styles.css`
**Depends on:** T1, T2
**Verify:** `python3 -m http.server 8765 --directory friyays/05-25-2026`; browser/manual: page renders with Alloro branding; `rg -n "feature-inventory.md|documentation.md|user-email.md|ship-checklist.md" AGENTS.md friyays/05-25-2026`
