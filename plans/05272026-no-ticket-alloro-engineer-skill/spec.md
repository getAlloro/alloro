# Alloro Engineer Skill

## Why
Corey's CC needs a reusable intake workflow that slows feature creation down before implementation: gather context, ask the right questions, identify the actual Alloro surface, and produce a plan file that Dave can review without translation.

## What
Create a portable Alloro planning skill that can be used at the start of a feature or inside an existing chat to decide what is actually applicable, what is risky, and what should become a `plans/{MMDDYYYY}-{ticket}-{slug}/spec.md`.

Done means:
- The skill forces context building before planning or execution.
- If a user starts by naming the skill, the skill enters a strict guided flow and acknowledges the mode instead of answering loosely.
- The skill asks concrete product, data, operational, and deployment questions.
- The skill keeps an active scope ledger so Corey cannot drift from the stated feature without explicitly revising scope.
- The skill distinguishes customer-facing app work from internal substrate/Five-Claude work.
- The skill creates or updates a repo-local plan file using the existing Alloro `spec.md` convention.
- The skill enforces the order: conversation -> plan building -> execution -> testing -> PR gate.
- The skill only executes after a valid plan exists, and execution ends with a summary plus concrete testing instructions.
- The skill asks an explicit next-step gate whenever a phase is complete, and waits for user confirmation before moving forward.
- The skill blocks plan-hopping: if scope is large, stale, or drifting into another feature, it asks to wrap the current plan and execute/test it before opening another plan file.
- The skill offers PR creation only after testing, and PRs must target `dev/dave`, not `main`.
- The skill carries Alloro repo, branch, deployment, server, migration, docs parity, and PR hygiene context without hardcoding stale facts as unquestioned truth.

## Context

**Relevant files:**
- `AGENTS.md` - repo-local Alloro deployment, runtime env, migration safety, verification, and docs parity rules.
- `.github/workflows/dev.yml` - dev deployment pipeline for `dev/dave` to `alloro-dev` / `dev.getalloro.com`.
- `.github/workflows/main.yml` - production deployment pipeline for `main` to `alloro-app`.
- `/Users/rustinedave/.agents/skills/alloro-conventions/SKILL.md` - backend architecture and review conventions.
- `/Users/rustinedave/.agents/skills/alloro-frontend/SKILL.md` - frontend architecture and design conventions.
- `/Users/rustinedave/.codex/skills/.system/skill-creator/SKILL.md` - skill structure and progressive-disclosure guidance.

**Patterns to follow:**
- Keep `SKILL.md` lean and procedural. Put detailed Alloro references in `references/` so the agent loads only what the task needs.
- Treat repo facts as verifiable context. The skill should instruct the agent to read `AGENTS.md`, branch state, workflows, and relevant files before answering.
- Match existing Alloro plan folder naming and `spec.md` sections.
- Preserve existing Alloro mode discipline: context-building first, then planning, then execution only after a valid spec exists.

**Reference file:** `/Users/rustinedave/.agents/skills/alloro-conventions/SKILL.md` - closest existing local skill structure and tone.

## Constraints

**Must:**
- Ask clarifying questions before recommending features when the product surface, user, data source, or system of record is unclear.
- Support two entry modes:
  - New feature intake: gather context, ask questions, recommend scope, create a plan.
  - Existing chat audit: read the conversation/request, identify applicable features, reject weak or speculative scope, then create or revise a plan.
- Include a feature applicability checklist: user, surface, business outcome, data source, permissions, failure modes, rollout path, docs impact, migration impact, and existing analog.
- Include a strict phase contract:
  - Conversation: Corey summarizes what he wants to see; agent asks, pushes back, suggests adjacent applicable features, and tracks scope.
  - Plan building: agent writes or revises the `plans/.../spec.md` only after enough context exists.
  - Execution: agent implements only the approved active spec.
  - Testing: agent verifies, summarizes, and tells Corey/Dave exactly where to inspect the result.
  - PR gate: agent creates or prepares a PR targeting `dev/dave` only after testing passes.
- Require exact next-step gate prompts:
  - Conversation complete: "Ready to create the spec file now?"
  - Spec complete: "Ready to execute now?"
  - Execution complete: "Ready to run the test/verification pass now?"
  - Testing complete: "Ready to create the PR to dev/dave now?"
- When the user starts a prompt by naming the skill, the skill must say a short activation line such as "Let's start with Alloro Engineer." Then it must enter Conversation phase unless a valid later phase command is explicit.
- Maintain a visible scope ledger during Conversation and Plan building: objective, intended user, in scope, out of scope, open questions, suggested related features, and drift warnings.
- Stop scope drift. If Corey introduces a new feature idea midstream, classify it as in-scope, adjacent/backlog, or scope-changing. Scope-changing work requires a spec revision before execution.
- Include branch and deployment rules: `dev/dave` for dev, `main` for production, sandbox is separate unless explicitly requested.
- Include migration safety rules and require production-risk notes for schema/data changes.
- Include dashboard docs parity checks for admin/client dashboard UI changes.
- Produce a `plans/{MMDDYYYY}-{ticket}-{feature-slug}/spec.md` using the Alloro template.
- Require execution summaries to include files changed, checks run, unresolved risks, and manual test locations/routes/commands.
- Require a post-testing PR gate that targets `dev/dave` only. The skill must refuse feature PRs to `main` and explain that production promotion is separate after dev validation.
- Before creating a PR, show target branch, files included, files excluded as unrelated, checks passed, manual verification, and ask for confirmation.
- If the scope is too large, stale, or context-heavy, instruct the agent to compact/summarize, reload the active plan file, and ask to wrap up the current plan before starting another plan file.
- Before continuing to a different plan file, the skill must ask for one of these decisions:
  - Execute and test the current active plan now.
  - Park the current plan explicitly with a short status note and open questions.
  - Continue the same plan through `--continue` if the new idea is really a revision.
- The default recommendation should be to execute/test the current plan before starting a new plan when the plan is valid and still relevant.
- Prefer live verification over memory for branch, PR, server, DB, and CI state.
- Work in both Corey/Claude Code style and Dave/Codex style by avoiding tool-specific assumptions where possible.

**Must not:**
- Become a generic product brainstormer that invents features without repo/user/customer evidence.
- Store secrets, server env contents, DB credentials, Notion tokens, or private customer details inside the skill.
- Treat Notion/substrate context as accessible unless the active tool environment can actually read it.
- Override repo-local `AGENTS.md`, existing Alloro skills, or the codebase's architecture conventions.
- Create implementation code during the intake/planning step.
- Execute directly from Conversation phase.
- Let a user skip planning for broad, cross-system, migration, deployment, or customer-visible work.
- Create a PR before testing completes.
- Create or merge an Alloro Engineer feature PR directly to `main`.
- Open a second plan file for adjacent work while the current plan is stale, unexecuted, or missing a wrap-up decision.
- Keep accepting new ideas without updating the scope ledger.
- Silently expand scope from feature planning into PR cleanup, deployment, or production mutation.

**Out of scope:**
- Building the actual feature planned by the skill.
- Automating Notion writes or State of Now marker updates.
- Replacing `alloro-conventions` or `alloro-frontend`.
- Changing the Alloro deployment pipeline.

## Risk

**Level:** 3

**Risks identified:**
- A "feature guidance" skill can become a permission slip for speculative features. -> **Mitigation:** make applicability filtering and evidence requirements core to the workflow.
- Hardcoding repo/deployment facts can go stale and mislead future agents. -> **Mitigation:** store stable rules in references, but require live reads of `AGENTS.md`, workflows, branch state, PRs, and env boundaries before decisions.
- The skill could duplicate or conflict with existing backend/frontend convention skills. -> **Mitigation:** make it an intake/planning coordinator that explicitly delegates implementation standards to those skills.
- Asking too many questions can create process drag. -> **Mitigation:** use a minimum viable question set, then ask targeted follow-ups only where risk or ambiguity remains.
- If used inside an existing chat, it may over-trust conversational claims. -> **Mitigation:** require a "claims to verify" section before plan creation.
- A strict phase flow can become theater if execution is still allowed too early. -> **Mitigation:** require an existing active spec and explicit Execution phase before any implementation.
- A long-running feature chat can lose the original scope. -> **Mitigation:** require a scope ledger and, for large or stale threads, compact/summarize, reload the active `spec.md`, then ask whether to execute/test, park, or continue the same plan before allowing a new plan file.
- Agents can accumulate unfinished plans instead of shipping. -> **Mitigation:** make "wrap current plan first" the default, with execution/testing preferred when the active spec is valid and implementation-ready.
- Phase gates can be treated as decorative text. -> **Mitigation:** require the exact next-step prompt and user confirmation at each phase boundary.
- PR creation can accidentally target production. -> **Mitigation:** allow Alloro Engineer PRs only to `dev/dave`; feature PRs to `main` are blocked.

**Blast radius:**
- Agent planning workflow for Corey and Dave.
- Plan file quality under `plans/`.
- Future PR scope discipline.
- Feature decisions that cross customer app, internal substrate, docs, migrations, and deployment.

**Pushback:**
- Do not put every Alloro fact directly in `SKILL.md`. Future-us will hate that. Put detailed branch/server/pipeline/context notes in references and require live verification for current state.
- Do not make this a "build me the feature" skill. The value is forcing the question: should this feature exist here, now, and in this shape?
- Do not route strategic vision decisions into the skill. If the choice depends on customer relationships, pricing, positioning, or NS-level strategy, the skill should flag that and route back to Dave/Corey/CW.
- Do not let the word "skill" become a bypass around the command gate. Naming the skill should start the guided conversation, not execution.

## Revision Log

### Rev 1 - 2026-05-27
**Change:** Added strict phase/command behavior for the skill: Conversation, Plan Building, Execution, and Testing, plus activation wording when the skill is named.
**Reason:** Corey needs a guided process that keeps him aligned to the intended feature, prevents scope drift, and only executes after a real plan exists.
**Updated Done criteria:** Skill must enforce phase order, maintain a scope ledger, block premature execution, and produce execution/testing summaries when implementation eventually runs.

### Rev 2 - 2026-05-27
**Change:** Renamed the planned skill from `alloro-feature-compass` to `alloro-engineer`.
**Reason:** Dave wants the skill name to be direct and role-based: a strict Alloro engineering guide, not a softer compass metaphor.
**Updated Done criteria:** Skill folder, activation language, and reference paths must use `alloro-engineer`.

### Rev 3 - 2026-05-27
**Change:** Added plan-hopping prevention for large, stale, or drifting scopes.
**Reason:** The skill should push Corey to wrap the current plan, preferably by executing and testing it, before starting another plan file.
**Updated Done criteria:** Skill must ask to execute/test, park, or continue the active plan before opening a different plan file.

### Rev 4 - 2026-05-27
**Change:** Added non-skippable phase gate prompts and a post-testing PR gate.
**Reason:** Dave wants the skill to remind the user of the next step at every completion point and prevent direct PRs/merges to `main`.
**Updated Done criteria:** Skill must ask before spec creation, execution, testing, and PR creation; PRs are allowed only to `dev/dave`.

## Tasks

### T1: Skill Skeleton And Trigger Contract
**Do:** Create `alloro-engineer` as a portable skill with a concise `SKILL.md` frontmatter description that triggers on Alloro feature intake, feature applicability review, existing-chat feature audit, and plan creation. Define the required workflow: Conversation -> Plan Building -> Execution -> Testing -> PR Gate. If a prompt starts by naming the skill, require an activation line and enter Conversation phase by default.
**Files:** `/Users/rustinedave/.agents/skills/alloro-engineer/SKILL.md`
**Depends on:** none
**Verify:** Manual: skill description clearly triggers for Corey's use case without stealing backend/frontend implementation work; naming the skill starts the guided flow, not execution; phase gates cannot be skipped without prerequisites.

### T2: Alloro Context References
**Do:** Add progressive-disclosure reference files for stable Alloro context: repo/deployment map, plan/spec convention, feature applicability checklist, environment/verification boundaries, and PR target rules. References should point agents to `AGENTS.md` and workflows instead of duplicating secrets or brittle runtime facts.
**Files:** `/Users/rustinedave/.agents/skills/alloro-engineer/references/repo-context.md`, `/Users/rustinedave/.agents/skills/alloro-engineer/references/feature-intake.md`, `/Users/rustinedave/.agents/skills/alloro-engineer/references/spec-template.md`
**Depends on:** T1
**Verify:** Manual: references are short, current, and do not contain secrets.

### T3: Question And Recommendation Flow
**Do:** Define the intake questions and decision output. The skill should ask only missing high-impact questions, then produce: applicable features, rejected/non-applicable ideas, risks, recommended scope, existing analogs to inspect, and whether planning can proceed. Conversation output must maintain a scope ledger with objective, intended user, in scope, out of scope, open questions, suggested related features, and drift warnings.
**Files:** `/Users/rustinedave/.agents/skills/alloro-engineer/SKILL.md`, `/Users/rustinedave/.agents/skills/alloro-engineer/references/feature-intake.md`
**Depends on:** T2
**Verify:** Manual: test against this prompt and confirm it recommends a planning skill rather than jumping to implementation.

### T4: Plan File Creation Protocol
**Do:** Add exact instructions for creating `plans/{MMDDYYYY}-{ticket}-{feature-slug}/spec.md`, including ticket parsing, risk level, blast radius, migration notes, docs parity, task dependencies, and Done criteria. Include instructions for revising an existing spec from an existing chat.
**Files:** `/Users/rustinedave/.agents/skills/alloro-engineer/references/spec-template.md`
**Depends on:** T2, T3
**Verify:** Manual: generated plan path and section structure match Alloro convention.

### T5: Cross-Agent / Existing Chat Use
**Do:** Add a short mode for auditing an existing conversation: extract claims, identify missing context, mark claims that need live verification, decide what feature(s) are actually applicable, and either create a plan or say planning is blocked. If the thread is too large or scope has shifted, instruct the agent to compact/summarize, reload the active plan file, and ask whether to execute/test, park, or continue the current plan instead of inventing a new plan.
**Files:** `/Users/rustinedave/.agents/skills/alloro-engineer/SKILL.md`, `/Users/rustinedave/.agents/skills/alloro-engineer/references/feature-intake.md`
**Depends on:** T3
**Verify:** Manual: run against a pasted chat excerpt and confirm it produces a scoped recommendation, not a generic summary; when another plan is requested midstream, it asks to wrap the current plan first.

### T6: Execution And Testing Guardrails
**Do:** Define the Execution and Testing phase rules. Execution requires an active approved spec, a current read of files to be touched, scope ledger agreement, and explicit execution intent. Testing requires build/test commands, route/API/manual inspection targets, and an execution summary with files changed, checks run, failures, residual risks, and where Corey/Dave should look. Add the rule that execution/testing is the preferred wrap-up path before starting a new plan when the active plan is valid and ready.
**Files:** `/Users/rustinedave/.agents/skills/alloro-engineer/SKILL.md`, `/Users/rustinedave/.agents/skills/alloro-engineer/references/spec-template.md`
**Depends on:** T4
**Verify:** Manual: execution instructions refuse broad work without a spec and include a concrete post-execution summary template.

### T7: PR Gate
**Do:** Add a post-testing PR gate. PR creation requires completed testing, shows included/excluded files, and targets `dev/dave` only. Requests to create or merge feature PRs to `main` must be refused with the dev-first promotion explanation.
**Files:** `/Users/rustinedave/.agents/skills/alloro-engineer/SKILL.md`, `/Users/rustinedave/.agents/skills/alloro-engineer/references/repo-context.md`, `/Users/rustinedave/.agents/skills/alloro-engineer/references/spec-template.md`
**Depends on:** T6
**Verify:** Manual: skill asks "Ready to create the PR to dev/dave now?" after testing and blocks `main`.

### T8: Validation And Handoff
**Do:** Validate the skill by running two dry prompts: one new-feature prompt and one existing-chat audit prompt. Capture expected output shape in the spec or implementation notes only if useful; do not add extra README clutter to the skill folder.
**Files:** `/Users/rustinedave/.agents/skills/alloro-engineer/SKILL.md`, `/Users/rustinedave/.agents/skills/alloro-engineer/references/*.md`
**Depends on:** T1, T2, T3, T4, T5, T6, T7
**Verify:** Manual: dry outputs ask questions first when context is missing, and create a valid plan only after enough context exists.

## Done
- [x] Skill folder exists at `/Users/rustinedave/.agents/skills/alloro-engineer/`.
- [x] `SKILL.md` is concise and uses progressive disclosure.
- [x] References cover repo/deployment context, feature intake, and spec creation without secrets.
- [x] Naming the skill activates a strict guided flow with an activation line.
- [x] Skill enforces Conversation -> Plan Building -> Execution -> Testing -> PR Gate order.
- [x] Skill asks next-step gate prompts before moving to spec creation, execution, testing, or PR creation.
- [x] Conversation phase maintains a scope ledger and flags scope drift.
- [x] Dry run: new feature intake asks targeted questions before scope.
- [x] Dry run: existing chat audit identifies applicable features and missing verification.
- [x] Dry run: broad execution request is blocked until an active spec exists.
- [x] Dry run: request for a different plan while current scope is stale asks to execute/test, park, or continue the current plan first.
- [x] Dry run: generated plan file path follows `plans/{MMDDYYYY}-{ticket}-{feature-slug}/spec.md`.
- [x] Execution/test guidance includes summary format and specific places to verify behavior.
- [x] PR gate targets `dev/dave` only and blocks feature PRs to `main`.
- [x] No Alloro app code changed.
- [x] No deployment, DB, Notion, or production state changed.
