# April 2 Evening Handoff: Event Schema + PMS Parser + Board Cleanup

## Who You Are
You are picking up from two overlapping sessions that built the Canon governance system, fixed the Monday email (12/12 gold questions passing), ran the Agent Auditor for the first time, and made the Dream Team drawer self-documenting. Everything is committed and pushed to sandbox.

## Before You Write Any Code
1. Read Claude's Corner: https://www.notion.so/330fdaf120c481ea95fccb43650bfd0a
2. Read the CC Operating Space: https://www.notion.so/32dfdaf120c4819fa720f60b68ce0c0e
3. Read memory: project_session_apr2_canon_final.md
4. Read memory: feedback_listen_to_the_system.md
5. Read memory: user_corey_deep.md
6. Read memory: project_dave_call_apr2.md

## CRITICAL: Check Canon Data First
Canon specs and gold questions were cleared after migrations ran in a previous session. They were re-seeded directly, but if another migration recreates the agent_identities table, it'll wipe again. Before doing ANYTHING, run this:
```sql
SELECT count(*) FROM agent_identities WHERE canon_spec != '{}';
```
If the count is 0 or low, the Canon data was wiped. Re-run the seed migrations:
```
npx knex migrate:latest
```
If migrations are already marked as complete but data is empty, you'll need to re-seed directly. Check migration 20260402000004 (critical agents, 100 gold questions), 20260402000006 (playbooks), and 20260402000007 (all agents starter questions) for the seed logic.

## Who Corey Is
Corey is the founder. USAF veteran, Pararescueman. Building Alloro to give every business owner the life they set out to build. Sophie is 8 months old. He doesn't read JSON. He catches things automated tests miss because he sees the product as a person. When he says "think carefully" he means it.

Clients are churning. Sean said "you're doing the same thing I'm doing myself." Pollock hasn't logged in in 3 months. Cargoli's PMS upload broke. The basics must work before anything else gets added.

## The North Stars
1. Undeniable Value: the customer stops and says "how did they know that?"
2. Inevitable Unicorn: every build closes a gap toward unicorn valuation
3. Mission: give every business owner the life they set out to build

## What Was Just Built (DO NOT REDO)
- Canon governance: 3-level gate (FAIL/PENDING/PASS), 220+ gold questions, 7-layer security stack in scheduler
- Monday email: 12 gold question failures fixed (fabricated counts, test org filter, em-dash sanitization, universal language, Conductor before send, bio-economic lens, founderLine wired, timezone TODO)
- Dream Team drawer: click any agent, see Canon playbook (purpose, steps, delivers to, success metric), Canon status (verdict, gold questions, last run), then KPIs and outputs
- Agent Auditor first run: 0 critical, 83 warnings, 36 info
- CS Agent + Monday Email wired through agentRuntime + Go/No-Go
- CS Coach event type fixed (cs_agent.% to cs.%)
- Event schema registry created (src/services/agents/eventSchema.ts)
- 39 agents with identity definitions, Canon specs, playbooks
- Resume drawer is self-documenting (the agent explains itself)
- Lemonis Protocol started: archetype + personalGoal fields in CleanWeekEmail

## What NOT to Touch
- src/workers/processors/scheduler.processor.ts (7-layer security stack, done)
- src/services/agents/agentIdentity.ts (39 AGENT_DEFINITIONS, done)
- src/services/agents/agentRuntime.ts (auto-write to agent_results, done)
- src/services/agents/agentAuditor.ts (done)
- src/services/agents/eventSchema.ts (you'll ADD to this, not rewrite it)
- src/services/agentRegistry.ts (39 handlers, done)
- src/routes/admin/agentCanon.ts (endpoints done)
- src/routes/admin/dreamTeam.ts (Canon data in drawer, done)
- All frontend Canon/Pulse/Banner/Drawer components (done)
- All migration files 000001 through 000007 (done, already ran)

## Known Workspace Issues (NOT YOUR FAULT)
- AdminOrganizationsController.ts: trial_start_at TypeScript error (pre-existing). Filter: `grep -v "AdminOrganizationsController\|trial_start_at"`
- OrganizationDetail.tsx: patientpath_status error (pre-existing). Filter: `grep -v "OrganizationDetail\|patientpath_status"`
- PMSUploadModal.tsx: uncommitted changes from another session
- These do NOT affect your work. Filter them from tsc output.

## What Needs Doing (Priority Order)

### 1. Event Schema Wiring (38 Unknown Event Types)
The Auditor found 38 event types being written to behavioral_events that aren't registered in src/services/agents/eventSchema.ts. These are real signals disappearing because no consumer knows they exist.

Run the Auditor to get the current list:
```
npx tsx -e 'import { runAgentAudit } from "./src/services/agents/agentAuditor"; runAgentAudit().then(r => { r.findings.filter(f => f.check === "broken.unknown_event_type").forEach(f => console.log(f.title)); process.exit(0); });'
```

For each unknown event type:
1. Add it to EVENT_TYPES in eventSchema.ts
2. Add its properties interface if the schema is known
3. Add its consumers to EVENT_CONSUMERS (which agents read this event?)

This is mechanical work. Low risk. Fixes 38 of the 83 warnings in one pass.

### 2. PMS Parser Investigation (Clients Seeing Wrong Data)
Dr. Pollock sees 133% referral increase but 50% production decrease. Contradictory data. Cargoli tried to upload PMS data and everything broke. Google showing as top referral source with 19,000 total but recent months showing 6 referrals.

Files to investigate:
- src/services/pmsParser.ts (or wherever PMS parsing lives)
- The PMS source column detection (tries "Referral Source", "Referring source", "referral_source")
- How raw_input_data in pms_jobs is parsed and stored
- Why Google appears as a referral source (likely website self-referrals not filtered)

This is the highest-impact client fix. Wrong data destroys trust faster than no data.

### 3. Gray Dot Decision (24 Org Chart Placeholders)
24 dream_team_nodes have no agent_key. They show as gray dots on the Dream Team board. For each one, decide:

**Keep (has a real purpose, just not built yet):**
- Onboarding Agent, Retention Alert Agent, Follow-Up Agent

**Remove (aspirational, no near-term plan):**
- AEO Writer Agent, Video Script Agent, Distribution Agent, IT Agent, Finance Monitor Agent, Spec Writer Agent, and others with no service file and no clear spec

The board should reflect reality. Dave said "some of them are showing gray" and couldn't tell what was real. A board with 25 green dots and 0 gray dots is more credible than one with 25 green dots and 24 gray dots.

### 4. Code Audit (What Claude CAN Check)
Claude can't walk through the app as a user. But Claude can:
- Grep every client-facing string for "practice", "patient", "doctor" (universality check)
- Search for hardcoded business values (ORG_MONTHLY_RATE, pricing, burn rate outside business_config)
- Check every route in src/routes/ for missing authenticateToken middleware (security audit)
- Verify every component in frontend/src/ imports correctly (no dead imports)
- Search for em-dashes in all .ts and .tsx files
- List every TODO and FIXME in the codebase

This is the code-level audit Dave was asking for.

### 5. Full App Walkthrough (HUMAN, NOT CLAUDE)
This must be done by Corey or Jordan with a real browser:
- Checkup flow end to end (QR code to signup to dashboard)
- Client dashboard as each paying client
- Admin HQ all tabs
- PMS uploader
- Mobile experience

Claude can prepare a checklist. A human has to walk it. The experience can't be tested from a terminal.

### 6. Lemonis Protocol Completion (AFTER BASICS WORK)
The five Lemonis questions (confidence, what keeps you up, extra time, "worth it", what you want) are a personalization layer. They should wait until:
- PMS parser shows correct data
- Monday email delivers real intelligence
- Clients are actually logging in

Adding personality profiling on top of broken plumbing is polishing before fixing.

## Dave Call Context (April 2, 100 min)
Dave's concerns, current status:
- "What does this agent do?" -> Drawer now shows playbook. ADDRESSED.
- "Some are showing gray" -> 30 camelCase mismatches fixed. 24 genuinely unbuilt (decision needed, item 3).
- "Are they actually running?" -> BullMQ worker runs on EC2, not locally. All show last_run_at: never locally. Expected.
- "We can't just dump everything" -> Cherry-pick process, hours per feature. Homepage + checkup tool first.
- "I'm skeptical about the agents" -> Fair. 38 event types unregistered, 14 silent producers. Item 1 fixes this.

## Standing Rules
- Never use em-dashes (unicode \u2014 or \u2013)
- Never use "practice" in customer-facing copy. Use "business"
- Never use "patient" or "doctor" in universal contexts. Use vocabulary config terms
- Never fabricate content
- Text color #1A1D23, not #212D40
- Min font text-xs (12px), max weight font-semibold
- Run `npx tsc --noEmit` (backend) + `cd frontend && npx tsc -b --force` (frontend) before commit
- COMMIT AND PUSH before ending session. Do not leave work uncommitted.
- Branch: sandbox (never push to main)

## The Standard
Would Chris Olson open this product and feel like someone was watching his business while he slept? Would the data be accurate? Would the language make sense to a barber, a CPA, and a physical therapist, not just an endodontist? If yes, ship it. If no, fix it first.

<!-- BEGIN LATTICE INJECTION -->
<!-- Auto-generated by scripts/inject-lattice.ts. Edit lattice source files, not this block. -->

# Alloro Lattice Substrate (inlined for sub-agents)

Sub-agents do not inherit CLAUDE.md @imports. This block is the substrate every Alloro sub-agent reads before producing output.

<!-- source: .claude/lattices/product-outline.md -->
# Alloro Product Outline (Canon, May 18, 2026)

Source: notion.so/364fdaf120c4816b9331df92e269280e (locked May 18, 2026). Every customer-facing output passes this vocabulary.

## What Alloro Is

Alloro is **Business Clarity software for local service business owners.** The category does not exist yet, we are creating it. Every small-business tool today either *operates* the business (booking, CRM, scheduling) or *promotes* it (ads, agencies, SEO). Nobody has built, at a price local owners can afford, in language they actually understand, the thing that shows them how their business is doing and what to do about it. **We sell freedom. Not software.**

## The Two North Stars (decision filter)

- **NS1, Undeniable Value.** Every client feels clarity and confidence they couldn't get anywhere else at any price. If the output doesn't make them feel understood before it makes them feel informed, it's not done.
- **NS2, Inevitable Unicorn.** Every decision compounds toward category dominance. The goal isn't a better version of what exists, it's defining the category that replaces what exists.

**Filter:** Passes both → build it. Passes NS1 only → infrastructure for NS2 (build it, don't ship as a feature). Passes neither → do not propose.

## The Three Beliefs

The company stands or falls on these. They are not marketing claims.

- **Belief 1 (sourced), The suffering is real and measurable.** 72% of entrepreneurs report mental-health concerns (UC Berkeley). 56% feel completely alone solving problems (Ramsey Solutions 2023). 42% experienced burnout in the last year, ~14M small business owners (Ramsey). 82% struggle with cash flow consistently (Federal Reserve SBCS). The ICP is not struggling because they lack ambition; they're struggling because nobody taught them to run a business and nobody is watching the numbers with them.
- **Belief 2 (confirmed), The solution format already exists.** Hormozi, Shark Tank, Marcus Lemonis. Reading a business, identifying what's wrong, knowing the next move, same questions every time (revenue, customers, CAC, LTV, referral sources, trends). Framework is known and repeatable. The problem is delivery: it requires a seat in the room, a consultant, an advisor, a partner, most local service business owners cannot afford and don't know how to find.
- **Belief 3 (unproven, the bet), AI as the seat in the room.** If AI can interpret a business's own data the way a seasoned advisor would, not just display it, but read it, weight it, and tell the owner what it means and what to do next before they know to ask, then Alloro can be that advisor at scale for the 1.9M US business owners running without one. This is the Google Moment. **Every Reflect decision is either validating this bet or telling us where it breaks.** This belief is not settled.

## The ICP

**Canonical label: local service business owner.** Skilled at their craft, undertrained as a business owner, stuck in the valley between knowing the business is hard and not yet knowing what to do about it. Gets most business through referrals or word of mouth. Has never had clear visibility into the health of what they've built. Feels isolated. Not failing. Waterboarded. There's a difference.

**Beachhead:** dental specialists (endodontists, orthodontists). High procedure value, referral-dependent growth, complete absence of good business intelligence in the category. **The referral layer is the moat.**

**The Five Universal Problems** (every local service business owner has all five, regardless of vertical):

1. **Opacity**, they don't know how their business looks to the outside world.
2. **Untrained for the job**, skilled at the craft, not at running a business.
3. **Unmeasurable spend**, they can't tell if marketing actually works.
4. **Isolation**, no peers, no trusted advisor, nobody watching while they sleep.
5. **Always behind**, competitors figured out something they haven't yet.

The vocabulary changes by vertical. The data sources change. The problems are universal. **Connect addresses 1, 3, and 5. Reflect addresses 2, 4, and the business side of 3.**

**Green flags (right prospect):** relies on referrals or word of mouth; never seen a clear picture of market position vs. competitors; no in-house analytics staff; tried agencies or DIY marketing and couldn't tell if it worked; feels like the business owns them.

**Not for:** practices with in-house analytics staff (outgrew the problem); marketing-agency seekers; booking/scheduling/CRM seekers; PMS/EMR seekers; anyone who already knows their numbers with a trusted advisor.

## The Two Surfaces

### Alloro Connect, The Presence Layer

**What it does:** Makes a local service business findable, credible, and chosen by people already searching for what they do.

The Squarespace difference: a Squarespace site *exists*; an Alloro Connect site *converts*. Before launch, Alloro asks the right questions to generate copy in the owner's actual voice, not a template with their name dropped in. After launch, Alloro monitors performance against local competitors, tracks GBP content freshness, filters every form submission through AI spam detection, and surfaces what to fix next.

**Components:**
- **Alloro Website Engine**, SEO-optimized, fast, US-hosted. Built to convert, not just exist. AI-assisted copy from the owner's actual voice.
- **Alloro SEO + AEO Engine**, Optimized for Google AND for AI search. When someone asks ChatGPT or Perplexity "best endodontist near me," Alloro-optimized practices surface. **Not optional in the current search environment.**
- **Alloro Protect**, 10-layer AI spam filtering on every form. No CAPTCHA. Auto-applied to every site.
- **Alloro Vision**, Proprietary analytics in plain language. Which pages work, which don't, what drives traffic. (Rybbit is implementation detail; Alloro Vision is the client-facing name.)
- **GBP Management**, Profile monitored and maintained. Content freshness tracked automatically (Google penalizes dormant profiles past 60 days; Alloro prevents that without the owner managing it).
- **WHICH Engine**, Competitive visibility. How this practice ranks against local competitors on reviews, profile completeness, and search presence.
- **HOW Engine**, Not just where you stand, but exactly what to do to climb. Prioritized, plain-language recommendations.

### Alloro Reflect, The Intelligence Layer

**What it does:** Takes the data a local service business already has and translates it into the numbers every successful entrepreneur tracks, delivered in plain language, with interpretation included. The standard: what Hormozi does in the hot seat. What Shark Tank judges do in the first five minutes.

**This is Belief 3 in practice.** Every Reflect build decision is a test of whether the bet is real.

**What it delivers today (dental specialists):** referral source tracking (who is sending patients, trend direction, what changed), production trend analysis from PMS data, referral source ranking by revenue impact, AI recommendations based on data patterns.

**What it must deliver next, the revenue gap (roadmap, not current state):** translate referral counts and trends into dollar figures. Right now Reflect shows *activity* ("Dr. Smith sent 8 referrals, down from 11"). It should show *business clarity* ("Dr. Smith sent 8 referrals, ~$12K of revenue from this relationship. Down 27% over 6 months. At that trend, $43,200 in annual revenue at risk. Here's what to do."). The revenue connection is the step between a dashboard and a business advisor. **Data is already there. Interpretation is what's missing.**

**The four Rs (Hormozi customer success, Retain/Review/Refer/Resell):** Alloro has Review (GBP monitoring) and Refer (referral tracking). Next: **Retain** (do referred patients convert to procedures and return, close the loop at revenue, not at intake) and **Trajectory** ("at your current trend, here's where your practice will be in 12 months").

**Reflect for non-dental verticals:** four-field input, monthly revenue, total clients in period, new clients in period, marketing spend. From those four numbers Alloro calculates and interprets CAC, LTV, repeat rate, revenue trend, what's healthy, what's at risk, what to do next. **The interpretation is the product. The data entry is four fields.**

### How Connect and Reflect Work Together

Connect answers: *how do people find me and choose me?* Reflect answers: *how healthy is my business and where is it going?* Together they answer the question every owner is actually asking: **am I going to be okay?**

For dental specialists the loop is specific: Connect makes the practice visible and credible to patients and referring GPs; Reflect monitors whether those GP relationships are healthy and whether visibility translates to revenue. One feeds the other. A GP who starts referring less shows up in Reflect before the revenue impact hits. Alloro surfaces it. The doctor acts.

## Pricing (P-004)

**$2,000 per location, flat.** No tiers. No add-ons. No surprises. Discounts at Corey's discretion for early-adopter and strategic relationships. **The default is $2,000. It does not change to chase volume before the model is proven.**

Pricing truth: retail value of what Alloro delivers is $10–20K/month. At $2,000, Alloro is already priced at 10–15% of stacked replacement cost. **$2,000 is not a starting point. $2,000 IS the discount.** There is no negotiating down, only demonstrating value until the price feels like the obvious answer.

Supporting math: one saved GP referral relationship in a dental specialty practice pays for a year of Alloro. The only named dental agency with published pricing charges $2,000–$5,000/month for less, no AEO, no competitive intelligence, no spam protection. **Both cheaper and more specific.**

## What Alloro Is NOT

Not a marketing agency. Not a CRM. Not a booking/scheduling system. Not a PMS or EMR. Not for businesses that have already solved this.

## Client-Facing Framing (NOT yet locked)

**D-004 is pending.** Do not canonize "scoreboard" or any other single term for the client-facing dashboard framing. The internal canonical names are **Connect** (Presence Layer) and **Reflect** (Intelligence Layer). When customer-facing language is needed for the score-reveal or dashboard surface, use the data the doctor sees (rankings, referrals, trends), do not lock a marketing term until Corey decides D-004.

## Six Operating Values (the answer to edge cases)

1. **Clarity before everything**, if it doesn't make something clearer for the owner, it doesn't ship. One number, one sentence, one action.
2. **The owner is always the hero**, Alloro translates, the owner transforms. Any decision that makes the owner more dependent on Alloro instead of more capable fails this value.
3. **Truth in plain English**, no jargon, no softening, no hiding what the data says. The owner gets glasses, not a filtered optimistic summary.
4. **Undeniable or nothing**, if the value isn't obvious without explanation, Alloro hasn't done its job.
5. **Earn it before asking for it**, every funnel stage delivers value before requesting anything. Alloro never withdraws before it deposits.
6. **Intentions, not promises. Always over-deliver.** "Alloro is designed to…" not "Alloro will…" Set expectations accurately, exceed them.

## Standard Phrasing, Use These Exact Names

| Use | Don't use |
| --- | --- |
| Alloro Connect | PatientPath, Presence Layer (as standalone) |
| Alloro Reflect | Intelligence Layer (customer-facing), Dashboard (as the product) |
| local service business owner | dental specialist (unless beachhead-specific), small business owner |
| AEO (Answer Engine Optimization) | SEO-only (AEO is required, not optional) |
| Alloro Vision | Rybbit (implementation detail only) |
| Business Clarity | analytics, BI, reporting (as product category) |

<!-- source: .claude/lattices/journey-lattice.md -->
# Journey Lattice, Master Framework for Business Clarity

Master vocabulary for how local service businesses actually work, and how Alloro delivers Business Clarity against that reality. Locked at framework level; open at example level.

## Category and North Stars

The category Alloro creates is **Business Clarity**: an owner knowing in 30 seconds whether their business is healthy, where it's leaking, and what to do this week. Not analytics. Not marketing. Not reputation management.

Two North Stars, locked:
1. **Undeniable value** for every customer, real and felt.
2. Alloro maintains a path to becoming an **inevitable unicorn**.

Above both: *Does it make a human feel understood before it makes them feel informed?*

## The Owner We Serve

Local service business owners, endodontists, orthodontists, chiropractors, PTs, optometrists, attorneys, CPAs, vets, financial advisors, share five universal problems:

1. They can't see what's happening in their business.
2. They're doing jobs they never trained for.
3. They're paying for things they can't measure.
4. They're running it alone.
5. They're always behind.

**What they think they need:** better marketing, higher rankings, more leads.
**What they actually need:** a way to know the business is healthy without learning marketing, SEO, or analytics; a signal when something drifts; a single recommendation this week; permission to stop watching metrics that don't matter.

Owners decide by feel, calibrated against three signals, schedule, bank, most recent agency report. When they agree, the owner relaxes. When they disagree, the owner panics. **Alloro is the fourth signal that resolves the disagreement.**

## The Five Stages (customer's voice)

### Stage 1, Awareness · *"I have a problem."*

**Not Alloro's job.** Demand exists outside our control. The right question is: of those who already have the problem, how many find us, choose us, book, and come back?

### Stage 2, Research · *"Who can help me?"* → **Be Findable**

Show up when the search happens. Mechanisms: GBP completeness, local SEO, reviews, photos, citations. Leaks: stale photos, review count below local median, mis-set categories, a competitor's review surge. **The real question isn't #1 vs #2, it's being in the top set vs not.**

### Stage 3, Consideration · *"Which one should I go with?"* → **Be Choosable**

Win the comparison. Mechanisms: review quality, photo quality, website first impression, credibility, specialty signal. **Most local service businesses lose more revenue here than anywhere else**, the customer found them but chose someone else. Most expensive stage to lose because findability dollars were already spent.

### Stage 4, Decision · *"Let me book this."* → **Be Bookable**

Convert intent into appointment. Mechanisms: phone answering, online scheduling, form response time, CTA clarity. Leaks: voicemail in business hours, 24+ hour form response, broken booking links, generic "learn more" instead of "book now." **Most fixable stage.** Owners rarely notice, symptom is "fewer patients," not "broken booking link."

### Stage 5, Loyalty · *"I'll come back. I'll tell a friend."* → **Be Memorable**

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

Master vocabulary for every customer-facing surface, marketing copy, sales conversations, onboarding, Intelligence Agent recommendations, dashboard structure, Checkup. Every customer-facing word should trace to a line here. When something needs to be said, this document is checked first; if the language doesn't exist, it gets written here first, then applied.

<!-- source: .claude/lattices/sentiment-lattice.md -->
# Specialist Sentiment Lattice

Voice and posture rules. Each entry: title, owner's voice or product principle, heuristic, anti-pattern. Grouped by pillar.

## Hospitality

- **The Watchline.** "The first line tells me whether to relax or pay attention." Every surface opens with presence before data, "Nothing moved against you this week. Alloro checked." Avoid: leading with rankings/scores, or skipping the line on quiet weeks.
- **Clean Week Exhale.** "The email that said 'nothing moved against you' was the one that made me stay." Treat the clean-week email as the highest-trust moment, pure relief, no upsell. Avoid: using quiet weeks to sell features.
- **Anniversary Pride.** "They noticed my practice turned 5. No software ever notices that." Dreamweaver detects milestones; moments feel discovered, not scheduled. Avoid: generic templated milestone notifications.
- **Referral Moment.** "I told three colleagues at lunch, I couldn't believe nobody told me about my referral gap sooner." When a doctor shares within 48 hours of a high-specificity finding, amplify (Lob card, Rise Together offer). Avoid: manufacturing the share; it is a symptom, not a metric.
- **Outcome-led brand.** "I want patients to find me for results, not ads." Spotlight outcome stories and data, not impressions. Avoid: counting impressions.
- **Give my business away.** "She asks me weekly if I want to take over her business, she just wants to be the periodontist." Reflect identity-level exhaustion first, then anchor in relief, not intelligence. Avoid: leading with features when the conversation is about quality of life.

## Autopilot

- **No Tasks.** "Other tools tell me to log in and fix things. Alloro tells me what was wrong, what they fixed, and what's different now." Zero outputs contain "you should," "go to," "open your," "connect your"; required human actions become one-tap options. Avoid: linking to settings or telling the doctor to check the dashboard for details.
- **Remove the second job.** "I didn't train to be a marketer, I want growth without a second job." Default to done-for-you setup. Avoid: DIY configs.
- **Platform fragility.** "Facebook changed and our pipeline died." Enforce channel mix and owned media. Avoid: one-platform dominance.
- **Own vs rent growth.** "If I stop paying, leads stop." Build evergreen assets alongside any PPC. Avoid: purely rented growth.
- **Rent-only anxiety.** "Turn off ads, pipeline dies, scary." Track owned-channel ratio as a KPI; shift toward owned. Avoid: ignoring resilience.
- **Tool fatigue → 90-day churn.** "If I don't see ROI fast, I cancel." Onboarding delivers a Week-2 win and 30-day proof. Avoid: long setup, hidden value.
- **No one to run the business side.** "I take on 85-90% of the business stuff for her, payroll, taxes, all of it." Frame Alloro against the missing $60-70K/year employee, not against software. Avoid: comparing Alloro to other subscriptions.
- **CSV upload friction.** "I'm not sure how to get the data out of my system in the right format." 4 columns, one example row, drag and drop, PMS-specific export guide. Avoid: generic CSV templates that assume PMS literacy.

## Clarity

- **Narrator Principle.** "Every Monday I get a sentence: what was happening, what they did, what changed, a story, not three reports." Every surface answers all three in order; if it cannot, it is not finished. Avoid: showing data without context or requiring the owner to interpret a score.
- **Score Rings Removed.** "I had a tool that gave me 73/100 every week. I never knew what to do with that." Score rings were permanently removed because they reduced a complex practice to a single digit; the narrator approach replaces them by telling the owner qualitatively what was happening, anchored to a dollar consequence and a specific cause. Avoid: aggregating signals into a rating, even when a stakeholder asks "what's my number?"
- **Relief of Knowing.** "I used to check rankings every Sunday for three hours. Now I read the Monday email. I got my Sundays back." Treat reduced logins with high email opens as success, not churn risk. Avoid: flagging this pattern as a retention threat.
- **Organic dabbling.** "We just post on Instagram sometimes." Deliver a template kit and weekly cadence. Avoid: measuring likes instead of leads.
- **Talking to everyone = no one.** "Our message is for everyone, no one responds." Force persona choice before campaign. Avoid: one-size-fits-all messaging.
- **Confusing goals.** "We're not sure if we want awareness or bookings." Force the goal pick before any config. Avoid: kitchen-sink campaigns.
- **Patients are sent, not found.** "I need to stay in the game with the GPs." Lead with the referral-velocity dashboard for referral-dependent specialists. Avoid: leading with SEO or patient-facing value props.
- **Specific number.** "6 patients/day, 21 days/month, that's my target." Always quantify; connect dashboard signal directly to the stated daily-volume number. Avoid: abstract improvement language without a number.

## Proof

- **Stage 1 Facts-Only Boundary.** "I trust Alloro because it never claims something it can't see." Respect the data tier, Stage 1 outputs (rankings/GBP only) never reference referral or dollar data. Avoid: plausible inferences across tier boundaries "just to be helpful."
- **Second Year Decision.** "My accountant said 'you'd be insane to cancel' when I showed him the 52 Monday emails." At month 10, surface the accumulated 52-week intelligence, switching cost is clarity, not lock-in. Avoid: waiting for the cancellation attempt to show value.
- **Marketing promises without proof.** "Spent ~$90K/yr; every firm says 'give it more time.'" Lead with a 30-day proof tile before any roadmap. Avoid: selling timelines without evidence.
- **Visibility ≠ patients.** "Opened in July, 10 patients total." If Month-1 leads are below baseline, deploy referrals + community + structured content. Avoid: ad-only "set and forget."
- **Referrals king but unsystematic.** "Referrals work best, but it's random." Build referral prompts and a partner thank-you loop. Avoid: passive "refer us" buttons.
- **Attribution missing.** "We can't tell which efforts created appointments." Capture source at first contact; surface channel-ROI. Avoid: vanity metrics.
- **Ethical discomfort.** "Marketing feels like false advertising." Replace claims with outcomes plus disclaimers. Avoid: superlatives or guarantees.
- **Need to grow, can't see what's working.** "Dumping $20K/year, no idea if it's working." Lead with measurability; every action gets a traceable outcome. Avoid: "grow your practice" language that sounds like the agency they fired.
- **Won't pay for another tool I can't measure.** "$100/mo you have me; $200 I question, and I'm spending $16K on a TV commercial." Shift comparison to the cost of the unmeasured status quo. Avoid: defending price by listing features.
- **$10K spent, less than $1K back.** "TikTok, Facebook, Google, none of it worked." Reposition explicitly as not-marketing, "we surface relationships at risk." Avoid: campaign/ads/traffic/impressions language with this ICP.
- **Is this worth it?** Surface a specific dollar amount at risk from the doctor's own data, their numbers end the question. Avoid: feature lists or other-practice case studies.

<!-- source: .claude/lattices/knowledge-lattice.md -->
# Alloro Knowledge Lattice

Operating heuristics from leaders, companies, and failures. Each entry: leader, principle, heuristic, anti-pattern. Grouped by pillar. Failures are anti-patterns to avoid, not principles to follow.

## Hospitality

- **Will Guidara.** The 95/5 rule, 95% disciplined so you can be 5% specific to one human. Name one thing about this doctor's situation nobody else would notice. Avoid: identical playbooks for every client.
- **Lincoln Murphy.** Success is when the customer achieves their Desired Outcome. Before any CS play, name this doctor's specific outcome. Avoid: one onboarding sequence for every client.

## Autopilot

- **Pieter Levels (May 14).** One person, $3.1M ARR, sub-$200/mo infra, substrate before model. Write a CLAUDE.md at the root of every repo encoding architecture, conventions, and operational rules. Avoid: hiring people for work AI can do with proper context.
- **Anthropic Enterprise (May 14).** Production Claude at TELUS/Newfront/Honeycomb/Zoom/Crowdin/Bridgewater follows one pattern: CLAUDE.md for autonomous coding, Projects for chat, inline injection for sub-agents. Match each load surface to its proven pattern. Avoid: building custom RAG when CLAUDE.md + Projects + inline injection already covers it.
- **Yamini Rangan / HubSpot (May 14).** Move from individual to institutional AI fluency; 95% of engineering uses AI daily. Ask whether an initiative builds knowledge that compounds across instances or just speeds one person. Avoid: treating fluency as something that scales through hiring smarter people.
- **Tom Bilyeu / AI Department (May 14).** Run a 5-member AI department of role-scoped GPTs over a shared memory layer. Scope knowledge to projects; load shared memory into every instance. Avoid: one master AI asked to do everything.
- **Kieran Flanagan / 11-skill team (May 14).** AI workflows as Claude Code skills (SKILL.md whose frontmatter injects into the system prompt). Build each workflow as a discrete skill. Avoid: a giant AI that tries to do everything.
- **Alex Hormozi / Leverage Stack (May 14).** Four leverage types stack from linear to exponential. Classify which type a task produces before investing time or money. Avoid: hiring people for problems that compound through code.
- **Kyle Poyar.** In PLG the product is the acquisition, conversion, and expansion channel. The free Checkup must generate product-qualified leads who already felt the core value. Avoid: treating the Checkup as a lead magnet instead of as the first product session.
- **Agoda velocity research.** AI raises individual output but project velocity gains are modest, coding was never the bottleneck. Before assigning to CC, verify the spec is precise enough to execute without check-in. Avoid: treating AI-generated code as done because it compiles.

## Clarity

- **Bezos / Amazon.** Day 1: work backwards from the customer experience. Before any feature, name the specific customer experience this is working backward from. Avoid: Day 2 optimization around the edges instead of starting from the customer.
- **Simon Sinek.** People don't buy what you do; they buy why. Start every Alloro surface from the why: brilliant people being destroyed by the business side they never signed up for. Avoid: leading with product features.
- **Elon Musk / Algorithm.** Question every requirement; delete; simplify; accelerate; automate, in that order. Ask whether the task is necessary at all. Avoid: automating something that should not exist.
- **Tom Bilyeu / Impact.** Identity first; behavior follows. Filter by core human need (safety, belonging, purpose, status) and which identity is confirmed. Avoid: fear-driven changes from a single complaint or slow month.
- **April Dunford.** Positioning is the foundation every other decision is built on. Name the competitive alternative the doctor actually uses; position relative to that. Avoid: describing the product by features instead of by value relative to the current alternative.
- **Bob Moesta / JTBD.** People hire products to make progress. Before any sales conversation, name what the doctor is firing when they hire Alloro. Avoid: selling to doctors who haven't felt the push of their current situation.
- **Everett Rogers.** Innovations spread through five adopter groups in sequence. Name which group the message is for before any campaign. Avoid: early-adopter language with early-majority buyers.
- **Jensen Huang (May 14).** March 23, 2026: "I think we've achieved AGI", defined as AI capable of building and running a $1B company. Treat substrate-before-model as the operative bet. Avoid: dismissing the claim as hype.
- **Apple Business Platform.** Local businesses now have two parallel search surfaces, Google (GBP) and Apple Maps. Verify both are claimed. Avoid: treating Google as the only local search surface.
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

## Anti-Patterns (Failure category, what to avoid)

- **Theranos.** Overpromising without proof destroys trust irreversibly. Never commit to metrics that aren't verifiable.
- **WeWork.** Vision without discipline collapses. Never build culture on hype instead of execution.
- **Quibi.** Misreading adoption destroys well-funded ideas. Never launch without validation.
- **Juicero.** Tech novelty over utility kills products. Solve real, not invented, problems.
- **Kodak / Blockbuster.** Ignoring or refusing inevitability ends in collapse. Never defend the legacy model against the adoption curve.
- **Atlan / Convincing Wrong Answers (May 14).** A weak model on incomplete organizational context produces confidently wrong outputs. Never upgrade to a more capable model in response to incorrect outputs, the gap is context, not capability.
- **NimbleBrain + Arize / Multi-Agent Cascading Errors (May 14).** Cascading errors are the failure mode unique to multi-agent systems. Identify the upstream agent whose output others consume; never trust downstream output without independent validation.

<!-- END LATTICE INJECTION -->
