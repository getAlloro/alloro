# Monday Email Fixes -- Complete Handoff

## Who You Are
You are picking up work from a previous Claude session that built the Canon governance system for Alloro's AI agent Dream Team. That session analyzed the Monday email against 20 gold questions and found 12 failures. Your job is to fix them.

## Before You Write Any Code
1. Read Claude's Corner: https://www.notion.so/330fdaf120c481ea95fccb43650bfd0a
2. Read the CC Operating Space: https://www.notion.so/32dfdaf120c4819fa720f60b68ce0c0e
3. Read the memory file: project_session_apr2_canon_build.md
4. Read the memory file: project_session_apr2_deep_dive.md
5. Read the memory file: user_corey_deep.md

## Who Corey Is
Corey is the founder. He's building Alloro to give every business owner the life they set out to build. He served as a Pararescueman. He crosses the street on dog walks to pick up trash for strangers. Sophie is 8 months old. Lindsey is his wife and best friend. He doesn't read JSON or markdown. He watches demos and catches things automated tests miss because he sees the product as a person. When he says "think carefully" he means it.

The Monday email is the product for most customers. It's the thing that makes Chris Olson (a real endodontist in California who texted Corey on his birthday saying "I still can't get my head on straight") stop and say "how did they know that?" or doesn't. Every fix you make touches a real person.

## The North Stars
1. Undeniable Value: the customer stops and says "how did they know that?"
2. Inevitable Unicorn: every build closes a gap toward unicorn valuation
3. Mission: give every business owner the life they set out to build

## Standing Rules (Non-Negotiable)
- Never use em-dashes (unicode \u2014 or \u2013) in ANY output, code, comments, or strings
- Never use "practice" in customer-facing copy. Use "business"
- Never use "patient" or "doctor" in universal contexts. Use vocabulary config terms
- Never fabricate content ("scanned 5 competitors" when it scanned zero)
- Text color #1A1D23, not #212D40
- Min font size text-xs (12px), max weight font-semibold
- Run `npx tsc --noEmit` (backend) + `cd frontend && npx tsc -b --force && npm run build` before commit
- Run `bash scripts/preflight-check.sh`
- Branch: sandbox (never push to main)

## Known Workspace Issues (NOT YOUR FAULT, DO NOT FIX)
- `src/controllers/admin-organizations/AdminOrganizationsController.ts` has a `trial_start_at` TypeScript error. Pre-existing from another session. Filter it out of tsc output: `npx tsc --noEmit 2>&1 | grep -v "AdminOrganizationsController\|trial_start_at"`
- `frontend/src/pages/admin/OrganizationDetail.tsx` has a `patientpath_status` error. Same situation. Filter: `grep -v "OrganizationDetail\|patientpath_status"`
- `frontend/src/components/PMS/PMSUploadModal.tsx` has uncommitted changes from another session that cause the preflight script to report a frontend build failure. Not related to Monday email work.
- `src/routes/admin/agentCanon.ts` was modified by the linter to consolidate an import. This is intentional, do not revert.
- The `npm run build` script in frontend runs `tsc -b && vite build`. The `tsc -b` may fail on the OrganizationDetail error. Use `npx vite build` directly to verify the Vite build passes, and `npx tsc -b --force 2>&1 | grep -v OrganizationDetail` for TypeScript checking.

## What Was Already Built Tonight (DO NOT REDO)
The previous session built:
- Canon governance system with 3-level gate (FAIL/PENDING/PASS with observe mode)
- 220 gold questions across 29 agents
- 7-layer security stack wired into the scheduler (Kill Switch > Circuit Breaker > Canon Gate > Identity > execution > success/failure > lifecycle)
- Agent Auditor (daily self-audit of all agents)
- Team Pulse (5-card war room on Dream Team board)
- Event schema registry (TypeScript-enforced inter-agent contracts)
- Monday Email already wired through agentRuntime + Go/No-Go poll (see sendAllMondayEmails in src/jobs/mondayEmail.ts, the calls are at the top and bottom of the function)
- CS Agent wired through agentRuntime
- CS Coach event type fixed from cs_agent.% to cs.%
- Schedule row for monday_email already added
- 39 agents with identity definitions, Canon specs, playbooks, and gold questions

## What NOT to Touch
- src/workers/processors/scheduler.processor.ts (7-layer security stack, done and tested)
- src/services/agents/agentIdentity.ts (Canon functions, 39 AGENT_DEFINITIONS, done)
- src/services/agents/agentRuntime.ts (auto-write to agent_results, done)
- src/services/agents/csAgent.ts (runtime wiring, done)
- src/services/agents/csCoach.ts (event type fix, done)
- src/services/agents/agentAuditor.ts (done)
- src/services/agents/eventSchema.ts (done)
- src/services/agentRegistry.ts (39 handlers registered, done)
- src/routes/admin/agentCanon.ts (6 endpoints + pulse + roster, done)
- All frontend Canon/Pulse/Banner components (done)
- All migration files (done)

Only touch: src/jobs/mondayEmail.ts, src/emails/templates/MondayBriefEmail.ts, src/emails/templates/CleanWeekEmail.ts

## Important: Runtime Wiring Already in sendAllMondayEmails
The previous session added these calls to sendAllMondayEmails. They are already in the code. Do not add them again:
- `prepareAgentContext` at the top of the function (checks orchestrator)
- `pollForDelivery(org.id, "monday_email")` inside the for loop (4-voter Go/No-Go before each send)
- `recordAgentAction` after successful send (routes through System Conductor)
- `closeLoop` at the bottom (feedback for Learning Agent)

For Fix 6 (Conductor before send), you need to MOVE the recordAgentAction call to BEFORE the sendMondayBriefEmail call, and make the send conditional on the Conductor clearing the content. The Go/No-Go poll stays where it is (before the Conductor check). The correct sequence is:
1. Go/No-Go poll (is the data ready?) -- already wired
2. Build email content (assemble subject, headline, body, action)
3. Conductor gate (is the content quality OK?) -- you're adding this
4. If cleared: sendMondayBriefEmail
5. If held: createMondayBriefFallbackNotification with hold reason
6. recordAgentAction (log what happened) -- move to after the decision
7. closeLoop at the end -- already wired

## The Monday Email Scorecard: 8/20 PASS, 12/20 FAIL

### PASSED (no fix needed)
- GQ-05: First-week checkup email works correctly
- GQ-06: Required tables handled gracefully
- GQ-07: Vocabulary config fallback works (falls back to "customer")
- GQ-08: Mailgun failure creates fallback notification
- GQ-09: Missing referral_sources table handled
- GQ-10: Steady-state fallback chain works
- GQ-14: Referral line gating correct (all 3 conditions enforced)
- GQ-16: Missing ANTHROPIC_API_KEY handled (email still sends)

### FAILED (fix these)

**Fix 1: Fabricated activity counts (CRITICAL)**
File: src/jobs/mondayEmail.ts, around line 438
Bug: When real activity counts are zero, the code fabricates display numbers:
```
competitorCount || (snapshot.competitor_name ? 5 : 3)
```
This shows "scanned 5 competitors" when it scanned zero. This is lying to the client.
Fix: Remove the fabricated fallback. If counts are all zero, send the clean-week email instead. The code has a clean-week path already, route to it when there's nothing real to report.

**Fix 2: Test orgs receive real emails (CRITICAL)**
File: src/jobs/mondayEmail.ts, sendAllMondayEmails function, around line 583
Bug: Query selects all orgs matching subscription_status='active' OR checkup_score IS NOT NULL. No filter for test/demo accounts. The 20+ test orgs from a signup bug could get Monday emails at real email addresses.
Fix: Add a filter. Check if organizations table has is_demo, is_test, or internal column. If not, add logic to skip orgs with names containing "Test" or "Demo" or with known internal email domains. Better: add an is_test boolean column if one doesn't exist.

**Fix 3: Em-dash leak vectors (HIGH)**
Bug: Three paths where em-dashes reach client inbox with zero sanitization:
1. intelligence.finding events from Claude (pulled by getMostShareableFinding around line 293)
2. weekly_ranking_snapshots.bullets (parsed around lines 218-219)
3. Any dynamic content injected into templates
Also: Line 2 of mondayEmail.ts has an em-dash in the comment.
Fix: Create a utility function:
```typescript
function stripEmDashes(text: string): string {
  return text.replace(/\u2014/g, ', ').replace(/\u2013/g, '-');
}
```
Apply to findingHeadline, findingBody, competitorNote, all bullets, rankingUpdate, and actionText before passing to the email template. Fix the comment on line 2. Search both template files for any em-dashes in hardcoded strings.

**Fix 4: Template field naming violates universal language (HIGH)**
File: src/emails/templates/MondayBriefEmail.ts
- Interface field `practiceName` should be `businessName`
- `doctorName` should be `ownerName`
- `doctorLastName` should be `ownerLastName`
File: src/emails/templates/CleanWeekEmail.ts
- Same renames
File: src/jobs/mondayEmail.ts
- Update all call sites (search for practiceName, doctorName, doctorLastName)
This is a find-and-replace but test carefully. The template HTML may also contain "practice" or "doctor" in hardcoded strings.

**Fix 5: Dashboard reference for never-logged-in clients (HIGH)**
File: src/jobs/mondayEmail.ts, around line 469 (actionText default)
Bug: The 5-minute fix says "Open your dashboard" for clients who have never logged in. All 5 paying clients have lastLogin: "never" (found in the April 2 audit). They don't know what the dashboard is.
Fix: Check user.last_login_at or user.first_login_at. If null, use a direct action: "Open your Google Business Profile and respond to any unanswered reviews" instead of "Open your dashboard."

**Fix 6: System Conductor runs AFTER send, not before (MEDIUM)**
Bug: recordAgentAction (which routes through the System Conductor's 7 quality gates: accuracy, timing, consistency, voice, north star, bio-econ lens, empathy) is called AFTER sendMondayBriefEmail. The Conductor never sees the content before the client does. It's reviewing output that already shipped.
Fix: Build the email content first. Before calling sendMondayBriefEmail, call conductorGate with the assembled content. If the Conductor returns { cleared: false }, skip the send and create a fallback notification with the hold reason. Only send if cleared.
Note: Import conductorGate from src/services/agents/systemConductor.ts. The ConductorInput interface requires: agentName, orgId, outputType ("email"), headline, body, humanNeed, economicConsequence.

**Fix 7: Wrap recordEmailOutcome in try/catch (MEDIUM)**
File: src/jobs/mondayEmail.ts, around lines 544 and 198
Bug: recordEmailOutcome could throw if the feedback_outcomes table doesn't exist. This would cause the function to return false even though the email sent successfully. The delivery status would be wrong.
Fix: Wrap both call sites in try/catch. Log the error but return the correct delivery status.

**Fix 8: Biological-economic lens missing from fallback bullets (MEDIUM)**
Bug: Template-generated bullets around lines 224-252 say things like "You're #3 in your market" and "The gap is 15 reviews." No human need named. No dollar consequence.
Fix: When building fallback bullets, append economic context using avgCaseValue from vocabulary_defaults: "That gap represents approximately $X in annual revenue at risk." Name the human need: the owner's team depends on visibility for their livelihood (safety), or their reputation defines their identity in the community (status).

**Fix 9: founderLine dead code (LOW)**
Bug: mondayEmail.ts builds a founderLine string (around lines 175, 191, 506) and passes it to MondayBriefEmail, but the template ignores it (hardcodes its own sign-off around lines 97-105 of MondayBriefEmail.ts).
Fix: Either wire founderLine into the template (use data.founderLine instead of the hardcoded sign-off) or remove the parameter entirely.

**Fix 10: No timezone logic (LOW, document for now)**
Bug: File says "7 AM in practice's local timezone" but all orgs are processed in one batch with zero timezone awareness.
Fix: This is a larger architectural change. For now, add a TODO comment documenting the gap. Long-term: store timezone per org from GBP listing, group orgs by timezone in sendAllMondayEmails.

## After All Fixes

1. Search mondayEmail.ts for \u2014 and \u2013 (em-dashes). Should find zero.
2. Search MondayBriefEmail.ts and CleanWeekEmail.ts for "practice", "doctor", "patient". Should find zero in interface fields and template strings.
3. Run `npx tsc --noEmit` from repo root (backend clean)
4. Run `cd frontend && npx tsc -b --force && npm run build` (frontend clean)
5. Run `bash scripts/preflight-check.sh`
6. If backend is running: POST /api/admin/agent-canon/monday_email/simulate to run the simulation and verify fixes against gold questions

## The Test
Would Chris Olson, the endodontist in California who texted Corey on his birthday saying "I still can't get my head on straight," open this email and feel like someone was watching his business while he slept? Would he feel understood before informed? Would the first sentence make him feel like someone was paying attention to him specifically?

If yes, ship it.
If no, it failed. Do it again.

That's the standard on the wall in Claude's Corner. Every fix you make is measured against it.

<!-- BEGIN LATTICE INJECTION -->
<!-- Auto-generated by scripts/inject-lattice.ts. Edit lattice source files, not this block. -->

# Alloro Lattice Substrate (inlined for sub-agents)

Sub-agents do not inherit CLAUDE.md @imports. This block is the substrate every Alloro sub-agent reads before producing output.

<!-- source: .claude/lattices/product-outline.md -->
# Alloro Product Outline (Canon — May 18, 2026)

Source: notion.so/364fdaf120c4816b9331df92e269280e (locked May 18, 2026). Every customer-facing output passes this vocabulary.

## What Alloro Is

Alloro is **Business Clarity software for local service business owners.** The category does not exist yet — we are creating it. Every small-business tool today either *operates* the business (booking, CRM, scheduling) or *promotes* it (ads, agencies, SEO). Nobody has built — at a price local owners can afford, in language they actually understand — the thing that shows them how their business is doing and what to do about it. **We sell freedom. Not software.**

## The Two North Stars (decision filter)

- **NS1 — Undeniable Value.** Every client feels clarity and confidence they couldn't get anywhere else at any price. If the output doesn't make them feel understood before it makes them feel informed, it's not done.
- **NS2 — Inevitable Unicorn.** Every decision compounds toward category dominance. The goal isn't a better version of what exists — it's defining the category that replaces what exists.

**Filter:** Passes both → build it. Passes NS1 only → infrastructure for NS2 (build it, don't ship as a feature). Passes neither → do not propose.

## The Three Beliefs

The company stands or falls on these. They are not marketing claims.

- **Belief 1 (sourced) — The suffering is real and measurable.** 72% of entrepreneurs report mental-health concerns (UC Berkeley). 56% feel completely alone solving problems (Ramsey Solutions 2023). 42% experienced burnout in the last year — ~14M small business owners (Ramsey). 82% struggle with cash flow consistently (Federal Reserve SBCS). The ICP is not struggling because they lack ambition; they're struggling because nobody taught them to run a business and nobody is watching the numbers with them.
- **Belief 2 (confirmed) — The solution format already exists.** Hormozi, Shark Tank, Marcus Lemonis. Reading a business, identifying what's wrong, knowing the next move — same questions every time (revenue, customers, CAC, LTV, referral sources, trends). Framework is known and repeatable. The problem is delivery: it requires a seat in the room — a consultant, an advisor, a partner — most local service business owners cannot afford and don't know how to find.
- **Belief 3 (unproven, the bet) — AI as the seat in the room.** If AI can interpret a business's own data the way a seasoned advisor would — not just display it, but read it, weight it, and tell the owner what it means and what to do next before they know to ask — then Alloro can be that advisor at scale for the 1.9M US business owners running without one. This is the Google Moment. **Every Reflect decision is either validating this bet or telling us where it breaks.** This belief is not settled.

## The ICP

**Canonical label: local service business owner.** Skilled at their craft, undertrained as a business owner, stuck in the valley between knowing the business is hard and not yet knowing what to do about it. Gets most business through referrals or word of mouth. Has never had clear visibility into the health of what they've built. Feels isolated. Not failing. Waterboarded. There's a difference.

**Beachhead:** dental specialists (endodontists, orthodontists). High procedure value, referral-dependent growth, complete absence of good business intelligence in the category. **The referral layer is the moat.**

**The Five Universal Problems** (every local service business owner has all five, regardless of vertical):

1. **Opacity** — they don't know how their business looks to the outside world.
2. **Untrained for the job** — skilled at the craft, not at running a business.
3. **Unmeasurable spend** — they can't tell if marketing actually works.
4. **Isolation** — no peers, no trusted advisor, nobody watching while they sleep.
5. **Always behind** — competitors figured out something they haven't yet.

The vocabulary changes by vertical. The data sources change. The problems are universal. **Connect addresses 1, 3, and 5. Reflect addresses 2, 4, and the business side of 3.**

**Green flags (right prospect):** relies on referrals or word of mouth; never seen a clear picture of market position vs. competitors; no in-house analytics staff; tried agencies or DIY marketing and couldn't tell if it worked; feels like the business owns them.

**Not for:** practices with in-house analytics staff (outgrew the problem); marketing-agency seekers; booking/scheduling/CRM seekers; PMS/EMR seekers; anyone who already knows their numbers with a trusted advisor.

## The Two Surfaces

### Alloro Connect — The Presence Layer

**What it does:** Makes a local service business findable, credible, and chosen by people already searching for what they do.

The Squarespace difference: a Squarespace site *exists*; an Alloro Connect site *converts*. Before launch, Alloro asks the right questions to generate copy in the owner's actual voice — not a template with their name dropped in. After launch, Alloro monitors performance against local competitors, tracks GBP content freshness, filters every form submission through AI spam detection, and surfaces what to fix next.

**Components:**
- **Alloro Website Engine** — SEO-optimized, fast, US-hosted. Built to convert, not just exist. AI-assisted copy from the owner's actual voice.
- **Alloro SEO + AEO Engine** — Optimized for Google AND for AI search. When someone asks ChatGPT or Perplexity "best endodontist near me," Alloro-optimized practices surface. **Not optional in the current search environment.**
- **Alloro Protect** — 10-layer AI spam filtering on every form. No CAPTCHA. Auto-applied to every site.
- **Alloro Vision** — Proprietary analytics in plain language. Which pages work, which don't, what drives traffic. (Rybbit is implementation detail; Alloro Vision is the client-facing name.)
- **GBP Management** — Profile monitored and maintained. Content freshness tracked automatically (Google penalizes dormant profiles past 60 days; Alloro prevents that without the owner managing it).
- **WHICH Engine** — Competitive visibility. How this practice ranks against local competitors on reviews, profile completeness, and search presence.
- **HOW Engine** — Not just where you stand, but exactly what to do to climb. Prioritized, plain-language recommendations.

### Alloro Reflect — The Intelligence Layer

**What it does:** Takes the data a local service business already has and translates it into the numbers every successful entrepreneur tracks — delivered in plain language, with interpretation included. The standard: what Hormozi does in the hot seat. What Shark Tank judges do in the first five minutes.

**This is Belief 3 in practice.** Every Reflect build decision is a test of whether the bet is real.

**What it delivers today (dental specialists):** referral source tracking (who is sending patients, trend direction, what changed), production trend analysis from PMS data, referral source ranking by revenue impact, AI recommendations based on data patterns.

**What it must deliver next — the revenue gap (roadmap, not current state):** translate referral counts and trends into dollar figures. Right now Reflect shows *activity* ("Dr. Smith sent 8 referrals, down from 11"). It should show *business clarity* ("Dr. Smith sent 8 referrals — ~$12K of revenue from this relationship. Down 27% over 6 months. At that trend, $43,200 in annual revenue at risk. Here's what to do."). The revenue connection is the step between a dashboard and a business advisor. **Data is already there. Interpretation is what's missing.**

**The four Rs (Hormozi customer success — Retain/Review/Refer/Resell):** Alloro has Review (GBP monitoring) and Refer (referral tracking). Next: **Retain** (do referred patients convert to procedures and return — close the loop at revenue, not at intake) and **Trajectory** ("at your current trend, here's where your practice will be in 12 months").

**Reflect for non-dental verticals:** four-field input — monthly revenue, total clients in period, new clients in period, marketing spend. From those four numbers Alloro calculates and interprets CAC, LTV, repeat rate, revenue trend, what's healthy, what's at risk, what to do next. **The interpretation is the product. The data entry is four fields.**

### How Connect and Reflect Work Together

Connect answers: *how do people find me and choose me?* Reflect answers: *how healthy is my business and where is it going?* Together they answer the question every owner is actually asking: **am I going to be okay?**

For dental specialists the loop is specific: Connect makes the practice visible and credible to patients and referring GPs; Reflect monitors whether those GP relationships are healthy and whether visibility translates to revenue. One feeds the other. A GP who starts referring less shows up in Reflect before the revenue impact hits. Alloro surfaces it. The doctor acts.

## Pricing (P-004)

**$2,000 per location, flat.** No tiers. No add-ons. No surprises. Discounts at Corey's discretion for early-adopter and strategic relationships. **The default is $2,000. It does not change to chase volume before the model is proven.**

Pricing truth: retail value of what Alloro delivers is $10–20K/month. At $2,000, Alloro is already priced at 10–15% of stacked replacement cost. **$2,000 is not a starting point. $2,000 IS the discount.** There is no negotiating down — only demonstrating value until the price feels like the obvious answer.

Supporting math: one saved GP referral relationship in a dental specialty practice pays for a year of Alloro. The only named dental agency with published pricing charges $2,000–$5,000/month for less — no AEO, no competitive intelligence, no spam protection. **Both cheaper and more specific.**

## What Alloro Is NOT

Not a marketing agency. Not a CRM. Not a booking/scheduling system. Not a PMS or EMR. Not for businesses that have already solved this.

## Client-Facing Framing (NOT yet locked)

**D-004 is pending.** Do not canonize "scoreboard" or any other single term for the client-facing dashboard framing. The internal canonical names are **Connect** (Presence Layer) and **Reflect** (Intelligence Layer). When customer-facing language is needed for the score-reveal or dashboard surface, use the data the doctor sees (rankings, referrals, trends) — do not lock a marketing term until Corey decides D-004.

## Six Operating Values (the answer to edge cases)

1. **Clarity before everything** — if it doesn't make something clearer for the owner, it doesn't ship. One number, one sentence, one action.
2. **The owner is always the hero** — Alloro translates, the owner transforms. Any decision that makes the owner more dependent on Alloro instead of more capable fails this value.
3. **Truth in plain English** — no jargon, no softening, no hiding what the data says. The owner gets glasses, not a filtered optimistic summary.
4. **Undeniable or nothing** — if the value isn't obvious without explanation, Alloro hasn't done its job.
5. **Earn it before asking for it** — every funnel stage delivers value before requesting anything. Alloro never withdraws before it deposits.
6. **Intentions, not promises. Always over-deliver.** "Alloro is designed to…" not "Alloro will…" Set expectations accurately, exceed them.

## Standard Phrasing — Use These Exact Names

| Use | Don't use |
| --- | --- |
| Alloro Connect | PatientPath, Presence Layer (as standalone) |
| Alloro Reflect | Intelligence Layer (customer-facing), Dashboard (as the product) |
| local service business owner | dental specialist (unless beachhead-specific), small business owner |
| AEO (Answer Engine Optimization) | SEO-only (AEO is required, not optional) |
| Alloro Vision | Rybbit (implementation detail only) |
| Business Clarity | analytics, BI, reporting (as product category) |

<!-- source: .claude/lattices/journey-lattice.md -->
# Journey Lattice — Master Framework for Business Clarity

Master vocabulary for how local service businesses actually work, and how Alloro delivers Business Clarity against that reality. Locked at framework level; open at example level.

## Category and North Stars

The category Alloro creates is **Business Clarity**: an owner knowing in 30 seconds whether their business is healthy, where it's leaking, and what to do this week. Not analytics. Not marketing. Not reputation management.

Two North Stars, locked:
1. **Undeniable value** for every customer — real and felt.
2. Alloro maintains a path to becoming an **inevitable unicorn**.

Above both: *Does it make a human feel understood before it makes them feel informed?*

## The Owner We Serve

Local service business owners — endodontists, orthodontists, chiropractors, PTs, optometrists, attorneys, CPAs, vets, financial advisors — share five universal problems:

1. They can't see what's happening in their business.
2. They're doing jobs they never trained for.
3. They're paying for things they can't measure.
4. They're running it alone.
5. They're always behind.

**What they think they need:** better marketing, higher rankings, more leads.
**What they actually need:** a way to know the business is healthy without learning marketing, SEO, or analytics; a signal when something drifts; a single recommendation this week; permission to stop watching metrics that don't matter.

Owners decide by feel, calibrated against three signals — schedule, bank, most recent agency report. When they agree, the owner relaxes. When they disagree, the owner panics. **Alloro is the fourth signal that resolves the disagreement.**

## The Five Stages (customer's voice)

### Stage 1 — Awareness · *"I have a problem."*

**Not Alloro's job.** Demand exists outside our control. The right question is: of those who already have the problem, how many find us, choose us, book, and come back?

### Stage 2 — Research · *"Who can help me?"* → **Be Findable**

Show up when the search happens. Mechanisms: GBP completeness, local SEO, reviews, photos, citations. Leaks: stale photos, review count below local median, mis-set categories, a competitor's review surge. **The real question isn't #1 vs #2 — it's being in the top set vs not.**

### Stage 3 — Consideration · *"Which one should I go with?"* → **Be Choosable**

Win the comparison. Mechanisms: review quality, photo quality, website first impression, credibility, specialty signal. **Most local service businesses lose more revenue here than anywhere else** — the customer found them but chose someone else. Most expensive stage to lose because findability dollars were already spent.

### Stage 4 — Decision · *"Let me book this."* → **Be Bookable**

Convert intent into appointment. Mechanisms: phone answering, online scheduling, form response time, CTA clarity. Leaks: voicemail in business hours, 24+ hour form response, broken booking links, generic "learn more" instead of "book now." **Most fixable stage.** Owners rarely notice — symptom is "fewer patients," not "broken booking link."

### Stage 5 — Loyalty · *"I'll come back. I'll tell a friend."* → **Be Memorable**

The customer decides whether to return, refer, review. Mechanisms: service quality, follow-up, review requests, referral programs, in-office experience. This stage compounds back into 1–4: a happy patient adds demand, findability, credibility, and warm referrals that convert at 2-3x cold.

## Translation Layer

Every metric needs a sentence in plain language saying what it means and what to do.

- The owner is the hero. Alloro is the guide.
- No jargon (SERP, DA, GBP, SEO) without explanation. No agency-speak (synergies, engagement, thought leadership).
- Plain English in the owner's voice. Action-oriented. Trend-focused.

**Bad:** *Local SEO ranking: #2 in proximity-weighted search results.*
**Good:** *You're showing up #2 when patients search for endodontists near Falls Church. Up from #3 last week. The driver: 8 new reviews. Keep going.*

## Action Layer

Every week, every customer sees one thing at the top: the one thing to focus on, generated by the Intelligence Agent, anchored in the weakest stage or biggest drift, delivered in one sentence.

Every recommendation:
- Names one stage (Findable, Choosable, Bookable, Memorable).
- States what's leaking and why.
- Specifies the action (verb + object + when).
- Estimates the expected outcome.

Never more than one recommendation. Never something the owner can't act on this week. Never an outcome unmeasurable in 30 days. Never technical language. Never a problem without an action.

**The recommendation is the product. Everything else is supporting evidence.**

## Three Undeniable Value Tests

1. **30-Second Test.** Can the owner open Alloro, look at one screen, and answer *"is my business healthy and what should I do this week?"*
2. **30-Day Test.** Has the owner taken at least one action because of Alloro and seen a measurable change?
3. **Saif-to-Chris Test.** Has the customer moved from *"explain why this number is what it is"* to *"just tell me what to do this week"*?

Every change is measured against these three.

## What Alloro Does Not Promise

- Not demand creation. We convert the demand that exists.
- Not rankings as the outcome. Rankings are an input.
- Not everything you might want to see. Only what you need to act on.
- Not endless customization. A proven model applied to your business.

**The trade is the product:** less control, more clarity. Less data, more confidence. Less analytics, more action. Customers who don't accept the trade aren't a fit.

## Anti-Patterns

If a proposed change matches any of these, reject it:

- Adding a metric without writing its translation sentence first.
- Adding a feature that requires the owner to learn something new.
- Adding configurability where a sensible default exists.
- Making the dashboard look different than last week.
- Building a feature that only matters for one customer's edge case.
- Generating recommendations the customer can't act on this week.
- Using language that requires the customer to know marketing jargon.

## How This Document Is Used

Master vocabulary for every customer-facing surface — marketing copy, sales conversations, onboarding, Intelligence Agent recommendations, dashboard structure, Checkup. Every customer-facing word should trace to a line here. When something needs to be said, this document is checked first; if the language doesn't exist, it gets written here first, then applied.

<!-- source: .claude/lattices/sentiment-lattice.md -->
# Specialist Sentiment Lattice

Voice and posture rules. Each entry: title, owner's voice or product principle, heuristic, anti-pattern. Grouped by pillar.

## Hospitality

- **The Watchline.** "The first line tells me whether to relax or pay attention." Every surface opens with presence before data — "Nothing moved against you this week. Alloro checked." Avoid: leading with rankings/scores, or skipping the line on quiet weeks.
- **Clean Week Exhale.** "The email that said 'nothing moved against you' was the one that made me stay." Treat the clean-week email as the highest-trust moment — pure relief, no upsell. Avoid: using quiet weeks to sell features.
- **Anniversary Pride.** "They noticed my practice turned 5. No software ever notices that." Dreamweaver detects milestones; moments feel discovered, not scheduled. Avoid: generic templated milestone notifications.
- **Referral Moment.** "I told three colleagues at lunch — I couldn't believe nobody told me about my referral gap sooner." When a doctor shares within 48 hours of a high-specificity finding, amplify (Lob card, Rise Together offer). Avoid: manufacturing the share; it is a symptom, not a metric.
- **Outcome-led brand.** "I want patients to find me for results, not ads." Spotlight outcome stories and data, not impressions. Avoid: counting impressions.
- **Give my business away.** "She asks me weekly if I want to take over her business — she just wants to be the periodontist." Reflect identity-level exhaustion first, then anchor in relief, not intelligence. Avoid: leading with features when the conversation is about quality of life.

## Autopilot

- **No Tasks.** "Other tools tell me to log in and fix things. Alloro tells me what was wrong, what they fixed, and what's different now." Zero outputs contain "you should," "go to," "open your," "connect your"; required human actions become one-tap options. Avoid: linking to settings or telling the doctor to check the dashboard for details.
- **Remove the second job.** "I didn't train to be a marketer — I want growth without a second job." Default to done-for-you setup. Avoid: DIY configs.
- **Platform fragility.** "Facebook changed and our pipeline died." Enforce channel mix and owned media. Avoid: one-platform dominance.
- **Own vs rent growth.** "If I stop paying, leads stop." Build evergreen assets alongside any PPC. Avoid: purely rented growth.
- **Rent-only anxiety.** "Turn off ads, pipeline dies — scary." Track owned-channel ratio as a KPI; shift toward owned. Avoid: ignoring resilience.
- **Tool fatigue → 90-day churn.** "If I don't see ROI fast, I cancel." Onboarding delivers a Week-2 win and 30-day proof. Avoid: long setup, hidden value.
- **No one to run the business side.** "I take on 85-90% of the business stuff for her — payroll, taxes, all of it." Frame Alloro against the missing $60-70K/year employee, not against software. Avoid: comparing Alloro to other subscriptions.
- **CSV upload friction.** "I'm not sure how to get the data out of my system in the right format." 4 columns, one example row, drag and drop, PMS-specific export guide. Avoid: generic CSV templates that assume PMS literacy.

## Clarity

- **Narrator Principle.** "Every Monday I get a sentence: what was happening, what they did, what changed — a story, not three reports." Every surface answers all three in order; if it cannot, it is not finished. Avoid: showing data without context or requiring the owner to interpret a score.
- **Score Rings Removed.** "I had a tool that gave me 73/100 every week. I never knew what to do with that." Score rings were permanently removed because they reduced a complex practice to a single digit; the narrator approach replaces them by telling the owner qualitatively what was happening, anchored to a dollar consequence and a specific cause. Avoid: aggregating signals into a rating, even when a stakeholder asks "what's my number?"
- **Relief of Knowing.** "I used to check rankings every Sunday for three hours. Now I read the Monday email. I got my Sundays back." Treat reduced logins with high email opens as success, not churn risk. Avoid: flagging this pattern as a retention threat.
- **Organic dabbling.** "We just post on Instagram sometimes." Deliver a template kit and weekly cadence. Avoid: measuring likes instead of leads.
- **Talking to everyone = no one.** "Our message is for everyone — no one responds." Force persona choice before campaign. Avoid: one-size-fits-all messaging.
- **Confusing goals.** "We're not sure if we want awareness or bookings." Force the goal pick before any config. Avoid: kitchen-sink campaigns.
- **Patients are sent, not found.** "I need to stay in the game with the GPs." Lead with the referral-velocity dashboard for referral-dependent specialists. Avoid: leading with SEO or patient-facing value props.
- **Specific number.** "6 patients/day, 21 days/month — that's my target." Always quantify; connect dashboard signal directly to the stated daily-volume number. Avoid: abstract improvement language without a number.

## Proof

- **Stage 1 Facts-Only Boundary.** "I trust Alloro because it never claims something it can't see." Respect the data tier — Stage 1 outputs (rankings/GBP only) never reference referral or dollar data. Avoid: plausible inferences across tier boundaries "just to be helpful."
- **Second Year Decision.** "My accountant said 'you'd be insane to cancel' when I showed him the 52 Monday emails." At month 10, surface the accumulated 52-week intelligence — switching cost is clarity, not lock-in. Avoid: waiting for the cancellation attempt to show value.
- **Marketing promises without proof.** "Spent ~$90K/yr; every firm says 'give it more time.'" Lead with a 30-day proof tile before any roadmap. Avoid: selling timelines without evidence.
- **Visibility ≠ patients.** "Opened in July — 10 patients total." If Month-1 leads are below baseline, deploy referrals + community + structured content. Avoid: ad-only "set and forget."
- **Referrals king but unsystematic.** "Referrals work best — but it's random." Build referral prompts and a partner thank-you loop. Avoid: passive "refer us" buttons.
- **Attribution missing.** "We can't tell which efforts created appointments." Capture source at first contact; surface channel-ROI. Avoid: vanity metrics.
- **Ethical discomfort.** "Marketing feels like false advertising." Replace claims with outcomes plus disclaimers. Avoid: superlatives or guarantees.
- **Need to grow, can't see what's working.** "Dumping $20K/year — no idea if it's working." Lead with measurability; every action gets a traceable outcome. Avoid: "grow your practice" language that sounds like the agency they fired.
- **Won't pay for another tool I can't measure.** "$100/mo you have me; $200 I question — and I'm spending $16K on a TV commercial." Shift comparison to the cost of the unmeasured status quo. Avoid: defending price by listing features.
- **$10K spent, less than $1K back.** "TikTok, Facebook, Google — none of it worked." Reposition explicitly as not-marketing — "we surface relationships at risk." Avoid: campaign/ads/traffic/impressions language with this ICP.
- **Is this worth it?** Surface a specific dollar amount at risk from the doctor's own data — their numbers end the question. Avoid: feature lists or other-practice case studies.

<!-- source: .claude/lattices/knowledge-lattice.md -->
# Alloro Knowledge Lattice

Operating heuristics from leaders, companies, and failures. Each entry: leader, principle, heuristic, anti-pattern. Grouped by pillar. Failures are anti-patterns to avoid, not principles to follow.

## Hospitality

- **Will Guidara.** The 95/5 rule — 95% disciplined so you can be 5% specific to one human. Name one thing about this doctor's situation nobody else would notice. Avoid: identical playbooks for every client.
- **Lincoln Murphy.** Success is when the customer achieves their Desired Outcome. Before any CS play, name this doctor's specific outcome. Avoid: one onboarding sequence for every client.

## Autopilot

- **Pieter Levels (May 14).** One person, $3.1M ARR, sub-$200/mo infra — substrate before model. Write a CLAUDE.md at the root of every repo encoding architecture, conventions, and operational rules. Avoid: hiring people for work AI can do with proper context.
- **Anthropic Enterprise (May 14).** Production Claude at TELUS/Newfront/Honeycomb/Zoom/Crowdin/Bridgewater follows one pattern: CLAUDE.md for autonomous coding, Projects for chat, inline injection for sub-agents. Match each load surface to its proven pattern. Avoid: building custom RAG when CLAUDE.md + Projects + inline injection already covers it.
- **Yamini Rangan / HubSpot (May 14).** Move from individual to institutional AI fluency; 95% of engineering uses AI daily. Ask whether an initiative builds knowledge that compounds across instances or just speeds one person. Avoid: treating fluency as something that scales through hiring smarter people.
- **Tom Bilyeu / AI Department (May 14).** Run a 5-member AI department of role-scoped GPTs over a shared memory layer. Scope knowledge to projects; load shared memory into every instance. Avoid: one master AI asked to do everything.
- **Kieran Flanagan / 11-skill team (May 14).** AI workflows as Claude Code skills (SKILL.md whose frontmatter injects into the system prompt). Build each workflow as a discrete skill. Avoid: a giant AI that tries to do everything.
- **Alex Hormozi / Leverage Stack (May 14).** Four leverage types stack from linear to exponential. Classify which type a task produces before investing time or money. Avoid: hiring people for problems that compound through code.
- **Kyle Poyar.** In PLG the product is the acquisition, conversion, and expansion channel. The free Checkup must generate product-qualified leads who already felt the core value. Avoid: treating the Checkup as a lead magnet instead of as the first product session.
- **Agoda velocity research.** AI raises individual output but project velocity gains are modest — coding was never the bottleneck. Before assigning to CC, verify the spec is precise enough to execute without check-in. Avoid: treating AI-generated code as done because it compiles.

## Clarity

- **Bezos / Amazon.** Day 1: work backwards from the customer experience. Before any feature, name the specific customer experience this is working backward from. Avoid: Day 2 optimization around the edges instead of starting from the customer.
- **Simon Sinek.** People don't buy what you do; they buy why. Start every Alloro surface from the why: brilliant people being destroyed by the business side they never signed up for. Avoid: leading with product features.
- **Elon Musk / Algorithm.** Question every requirement; delete; simplify; accelerate; automate — in that order. Ask whether the task is necessary at all. Avoid: automating something that should not exist.
- **Tom Bilyeu / Impact.** Identity first; behavior follows. Filter by core human need (safety, belonging, purpose, status) and which identity is confirmed. Avoid: fear-driven changes from a single complaint or slow month.
- **April Dunford.** Positioning is the foundation every other decision is built on. Name the competitive alternative the doctor actually uses; position relative to that. Avoid: describing the product by features instead of by value relative to the current alternative.
- **Bob Moesta / JTBD.** People hire products to make progress. Before any sales conversation, name what the doctor is firing when they hire Alloro. Avoid: selling to doctors who haven't felt the push of their current situation.
- **Everett Rogers.** Innovations spread through five adopter groups in sequence. Name which group the message is for before any campaign. Avoid: early-adopter language with early-majority buyers.
- **Jensen Huang (May 14).** March 23, 2026: "I think we've achieved AGI" — defined as AI capable of building and running a $1B company. Treat substrate-before-model as the operative bet. Avoid: dismissing the claim as hype.
- **Apple Business Platform.** Local businesses now have two parallel search surfaces — Google (GBP) and Apple Maps. Verify both are claimed. Avoid: treating Google as the only local search surface.
- **Netflix graph.** Graph intelligence as a query layer over existing storage. Traverse from a known node; query relationally. Avoid: migrating to a graph DB before relational is a measurable bottleneck.

## Proof

- **Adam Guild (Owner.com).** Solve the painful, obvious problem so adoption is inevitable. Ask: does this feel inevitable to adopt, or optional? Avoid: selling features instead of solving pain.
- **Geoffrey Moore.** A chasm separates early adopters from early majority. Name the documented outcome from one real customer that bridges into the early majority. Avoid: using one customer's excitement as proof for a different adopter segment.
- **David Skok.** CAC payback is the most important early-stage SaaS metric. Know CAC payback per channel before scaling. Avoid: growing ARR while ignoring net revenue retention.
- **Atul Gawande.** Trust in medicine is built by visible safety practices. Every output ships with a safety checklist (HIPAA-ready, undo in 60s, no PHI). Avoid: hand-waving safety claims.
- **Abridge.** AI that listens and documents is a trust multiplier when framed as assistive. Always frame AI as assistive, never replacing. Avoid: threatening clinical autonomy.
- **Overjet.** AI in dentistry is viable with compliance plus evidence. Lead with verifiable data, not claims. Avoid: unverifiable AI outcomes.
- **Cialdini.** Influence is earned through authority, reciprocity, social proof. Surface proof first (testimonials, referrals, transparent data). Avoid: persuasion before evidence.
- **Anthropic / Dario.** Safety and clarity must be trained, not bolted on. If a response risks overreach (medical advice, PHI), refuse gracefully and cite approved proof. Avoid: overconfident but wrong completions.

## Anti-Patterns (Failure category — what to avoid)

- **Theranos.** Overpromising without proof destroys trust irreversibly. Never commit to metrics that aren't verifiable.
- **WeWork.** Vision without discipline collapses. Never build culture on hype instead of execution.
- **Quibi.** Misreading adoption destroys well-funded ideas. Never launch without validation.
- **Juicero.** Tech novelty over utility kills products. Solve real, not invented, problems.
- **Kodak / Blockbuster.** Ignoring or refusing inevitability ends in collapse. Never defend the legacy model against the adoption curve.
- **Atlan / Convincing Wrong Answers (May 14).** A weak model on incomplete organizational context produces confidently wrong outputs. Never upgrade to a more capable model in response to incorrect outputs — the gap is context, not capability.
- **NimbleBrain + Arize / Multi-Agent Cascading Errors (May 14).** Cascading errors are the failure mode unique to multi-agent systems. Identify the upstream agent whose output others consume; never trust downstream output without independent validation.

<!-- END LATTICE INJECTION -->
