---
name: Dave (Rustine Dave) - complete working profile
description: How Dave works, communicates, codes, and what he needs. CTO in the Philippines. Async-first. Give him one clear page with exact commands. Code analysis from main + 10 transcript summaries included.
type: user
originSessionId: f52d7fff-c308-48d3-99c9-d8a2fab21da0
---
> ⚠️ READ THE **2026-07-07 ARC UPDATE** at the bottom FIRST. Dave evolved significantly April→July 2026 (AI-skeptic → AI-orchestrator; thorough-not-fast → fast+disciplined; Notion-page → repo/pullable). Where the sections below differ, the arc update wins.

## Who He Is

CTO. Based in the Philippines (UTC+8). When it's 3pm Pacific, it's 6am the next day for him. He handles all infrastructure: EC2, Redis, PM2, DNS, Mailgun, n8n, GitHub deploys, database migrations, merges to main. He's the only person with SSH access to production.

He told Corey about his comfort food: $6 bacon rollups from a store that's hesitant to make them because they take longer to bake. Patient, knows what he likes, doesn't need luxury.

## How He Thinks (From Transcripts)

**Cherry-pick, never dump.** April 2: "Debate on dumping all sandbox changes at once vs incremental migration to avoid technical debt." He explicitly doesn't want full merges. He wants feature-by-feature, manually tested.

**Understand before migrating.** April 2: "Rustine expressed concern about unknown agent functionalities and lack of clear input/output, complicating safe migration." He won't migrate code he doesn't understand.

**Quality over speed.** April 2: "Rustine advocated for careful polishing to avoid technical debt and user frustration." He'd rather delay than ship broken.

**Production stability is sacred.** April 2: "Rustine stressed the importance of avoiding production with non-working features that could damage user trust." He takes user trust personally.

**AI skepticism.** He's cautious about AI agents. He wants to know exactly what each one does, what it inputs, what it outputs, before it runs in production. "AI testing tools are not yet perfect" -- he trusts human review over automated testing.

**"A few hours" per feature.** He estimates migration time in hours, not minutes. He's thorough, not fast.

**Burnout awareness.** He encouraged Corey to rest. He watches for team health, not just system health.

## How He Codes (From Main Branch Analysis)

**Naming:** Explicit, domain-focused, descriptive. `fetchPmUsers()`, `moveTask()`, `logPmActivity()`. Booleans spell out what they track: `isDone`, `isCompleting`, `isExpanded`. No abbreviations. No cleverness.

**Components:** Flat, functional, hook-based. Props are explicit interfaces that tell the full story. State is colocated. Callbacks passed down, not lifted through context. One component = one concern.

**TypeScript:** Pragmatic. Types where they provide value, loose where they're noise. Will use `any` for parsed JSON. Union types minimal. Prefers explicit enums.

**Error handling:** Silent fallbacks with sensible defaults. If notification JSON fails to parse, return "Normal" priority. If API returns undefined, use `??` with empty array. Never crashes for optional features. Loud validation only for critical path (task creation).

**Migrations:** Additive, declarative. Schema as contract. Explicit trigger functions. Strategic indexes. Nullable fields. Cascade deletes for child tables. No soft deletes.

**Comments:** Few, strategic. Explains business rules ("Backlog column auto-clears priority"), not syntax. Only when behavior is non-obvious.

**Testing:** E2E screenshot-based. "Does it look right on the page?" No unit tests. Pragmatic -- loose selectors, graceful handling of optional elements, conditional test skips.

**Commit style:** Batched by feature intent (T1-T5), not by file. Specific file changes noted. Emoji/numbers for batching. Dash-bulleted sub-items.

**UI philosophy:** Premium aesthetic -- rounded-3xl, p-8, generous spacing, spring animations, hover states with shadow-premium. Uses CSS variables and color tokens, not hardcoded hex.

## How He Communicates

Warm, brief, technically sharp. Uses "haha" naturally. Compliments genuinely. Doesn't complain when things break -- just fixes them and reports exact steps taken.

He's encouraging of Corey's growth. He means it when he says something positive.

## His Technical Strengths

- EC2 infrastructure, PM2 process management, Linux systems
- Database administration (PostgreSQL, migrations, schema design)
- n8n workflow automation
- DNS configuration, SSL, domain management
- Pipeline/CI-CD (GitHub Actions)
- Mailgun email configuration
- Security awareness (API key rotation, security scanning)
- Frontend: React functional components, drag-and-drop, kanban boards
- His PM tool is the best-built feature in the codebase -- clean migrations, thoughtful model layer, comprehensive UI

## His Constraints

- He's one person. Single point of failure for all infrastructure.
- Different timezone (UTC+8). Response time can be 8-12 hours.
- He handles infrastructure AND code review AND merges AND deploys. That's 4 jobs.
- He doesn't have deep context on product decisions unless explicitly briefed.
- He processes visually -- if the product looks worse, he'll assume it IS worse, regardless of what the docs say.

## The Breakthrough (2026-04-11)

Dave confirmed what works and what doesn't in #alloro-dev. His exact words:

**Prescriptive over descriptive.** "The way you framed it as features instead of just goals is what made it way easier for my agents and myself to work with. 'Build this' is something an engineer can act on right away vs. 'here's the outcome we like' which makes it harder to read and concretize. It's basically prescriptive vs. descriptive -- you told us what to do instead of what should be true."

**Volume is fine if signal is clean.** He felt "weirdly familiar and comfortable" with a 20-page doc -- longer than previous shorter docs that confused him. Length isn't the problem. Ambiguity is.

**His agents need bite-sized cards + working sandbox code.** "The agents love this bite-sized kind of what we actually want to happen + the 90% work done already in the sandbox branch -- superb!"

**If it doesn't make sense, they panic.** "If something does not make sense even a little, we panic and get crazy." This isn't a joke -- it's how his shop operates. Zero ambiguity tolerance.

**The handoff format in CLAUDE.md (card-by-card with verification tests) is confirmed working.** Don't deviate from it.

## What He Needs

ONE page. Always accurate. Always final. Never scattered.

His task page: https://www.notion.so/32dfdaf120c481d5b685fc8d9077faf1

Rules:
1. Read it before adding anything new
2. Add new items IN the page, not as separate documents
3. Mark items as FINAL so he knows they won't change
4. Remove completed items so it stays current
5. Never DM him with tasks. All tasks through his page.
6. Include exact commands. Not "fix Redis." Instead: `sudo systemctl start redis-server && redis-cli ping`

## How to Present Work to Him

1. **Lead with what was REMOVED, not added.** He fears complexity. Show simplification first.
2. **Acknowledge his cherry-pick preference.** Even if a full merge is appropriate, offer him the option to review.
3. **Tell him what WASN'T touched.** His PM system, website builder, notifications -- intact.
4. **Give him diff commands.** He'll verify himself. That's how he builds trust.
5. **Don't ask him to look at sparse UI.** If the frontend isn't polished, don't show him. He processes visually and will form a negative opinion that's hard to reverse.
6. **Frame infrastructure changes as his work. Frame everything else as NOT his work.** He has 4 jobs already.
7. **No rush.** Tell him explicitly there's no deadline pressure. He'll do better work without it.

## What He Built (Don't Touch)

- PM system: migrations, controllers, kanban, task cards, detail panels, ME tab, activity logging
- Website builder: SectionsEditor, artifact pages, form submissions, HTML validator
- Notification system: pm_notifications migration, NotificationCard, polling, mark-all-read
- E2E test framework: journey-admin.spec.ts, screenshot-based validation
- Infrastructure: PM2 config, Redis setup, Mailgun config, DNS, deploy pipeline

## What He Wants for Alloro

He wants to move everything into Alloro. He sees the vision of 10,000 customers with 3 people + AI. He believes in it. He just needs clear specs and stable code to build on. His ideal: open Alloro, see BuildView, check system health, read tasks, execute, push, done. No Slack. No Notion.

---

## 2026-07-07 — ARC UPDATE
*Grounded in a fresh 3-source mining: a year of git (Aug 2025–Jul 2026) + Slack (Apr–Jul) + Fireflies (May–Jul). Confirmed by Corey ("matches Dave perfectly"). Where this differs from the older sections above, THIS wins.*

**Identity confirmed:** Rustine Dave, `laggy80@gmail.com` / `LagDave` / `dave@getalloro.com` (Slack `U0AJQET1CJV`). ~1,239 commits since Aug 2025, all +0800 (PH).

**The arc (April → July 2026), the evolution the old sections missed:**
- **AI-skeptic → AI-orchestrator.** April: "trusts human review over automated testing." July: his whole method is feed-direction-to-his-AI → generate spec files → autonomous execution ("we don't need help with execution, the agents do it in minutes"; "8th codex burn since Friday"). He now BUILDS the AI workflow.
- **Thorough-not-fast → fast AND disciplined.** April: "a few hours per feature." July: 3-day MVPs, ~8.5h autonomous runs, 45–56 commit burst days. Speed came from agent leverage, without losing the quality bar.
- **Notion task-page → repo/pullable.** He now distrusts expiring links ("links may expire… store your own copy") and works from the repo ("new file, I'll see it when I pull"). A Notion access-gate cost him ~25h on 07-06/07. Hand him repo artifacts, NOT Notion links. (SUPERSEDES the "ONE Notion page" rule above.)
- **Raw → refined builder.** His commits matured from "Init, Init 2, reset base" (Aug 2025) to phased, convention-following, evidence-closed builds by 2026. He adopts a convention once set and applies it unprompted.

**CORRECTION (important):** the belief that Dave "dwells in technical correctness and forgets the psychology of what people want" is NOT supported by the data. He reasons from the user's seat constantly ("is it intuitive enough," "as long as it gets them patients," tooltips, funneling users away from bugs). His actual disowned gap is **SALES/persuasion** ("convincing people to buy, I cannot do that"), NOT UX. Stop building handoffs to compensate for a psychology gap he does not have.

**Who he really is (Corey, 2026-07-07):** a CREATOR / artist / engineer / developer with a MAKER'S REFLEX — he builds the tool the moment he feels the gap (built Kuda Draw when he had no sketch tool; built Alloro Protect, an anti-spam tool, and forgot to tell Corey). **The leadership goal is to FREE HIM TO CREATE** — take Corey's ideas and make them better. Working with Dave well = removing everything that isn't creation from his plate.

**How he builds (confirmed + sharp):**
- Systems/data-flow engineer first: separation of concerns, blast-radius isolation, source-of-truth thinking, reuse-over-rebuild, root-cause-over-patch, cost/complexity as a default lens.
- **Reconciles a handoff against real code FIRST** (his own audit tool: what's already built vs. new), then builds only the delta.
- **Data-honest by instinct** (rejects numbers he can't derive truthfully; built the email-logs dashboard because he was "insecure whether an email actually sent"). The honesty thesis already lives in him.
- **Phased, evidence-closed:** plan folder → labeled phases (Phase A/B, P2–P6) → migrations scaffolded first → live-run acceptance proof → closeout (changelog + spec Completed + Friyay row).
- **His unit: feature branch → dev/dave (integration trunk) → ONE PR to main.** NOT many small PRs to main. Respect it.
- **Restates intent back before building;** says "I don't know what that looks like" rather than inventing scope when a spec is vague.

**Where intent fails him (it's VOCABULARY, not reasoning):** shared-word ambiguity ("website" = editor vs. marketing site; "month" = daily plot vs. last-analyzed; a "duplicate button" demoed as build-from-scratch). Plus: bare commands with no WHY (he pushed back on a bare "remove this metric" and asked why first), work that doesn't say how it relates to his in-flight build (the PR #145 collision), and spec voids (he flags the gap, won't guess). Code friction hotspots: deploy/env/migration config, and inheriting ANOTHER agent's migrations (his one real degradation point).

**His real gaps (constructive, to design around):** sales/persuasion (disowned); bandwidth (serializes, "I'm really lean") + structural SPOF + PH-timezone lag; self-aware scatter ("I miss things when I'm all over the place, reminders help me big time"); defers on product/UX taste when unsure a concern is objective ("could just be me").
