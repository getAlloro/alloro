# Inversion Ch2-7 — Frame Validation (2026-07-07)

Validation of the inversion architecture (Ch2-7) against the strategic frame staked **2026-07-07** (Value #2 split + done-for-you definition + NS1-attributed + the concierge/athlete positioning), which was staked AFTER the specs were written 2026-07-06. Six per-chapter validators + one capability verification (GBP write-path). This is the GUIDE for sharpening the specs. **Architecture-validation only, NOT a build** (landing-gate: build waits for Slice 1 / Ch1 to land, then one chapter at a time).

## The load-bearing capability fact (verified, receipts)
**The GBP write-path is BUILT + WIRED** (verified on `origin/dev/dave` 2026-07-07):
- **GBP POST publish:** real `axios.post` to Google My Business v4 `localPosts` — `src/controllers/gbp/gbp-services/gbp-write.service.ts:121/131`; wired route -> service -> queue -> worker -> Google (`GbpLocalPostDeploymentService.ts:264`, `gbpAutomation.processor.ts:31`, `worker.ts:482`, `POST /api/gbp-automation/work-items/:id/deploy`).
- **REVIEW REPLY:** real `axios.put` to the review `/reply` endpoint — `gbp-write.service.ts:71/81`; two live paths (queued deploy + direct published-reply route).
- **Honesty caveat:** publishing is gated behind a human APPROVE step (Alloro auto-drafts, a person approves, then it publishes). Truthful claim = **"Alloro drafts it and, on your approval, publishes/replies for you"** (NOT silent-autonomous). The approve-gate is "AI drafts, human stakes" + keeps the owner in command; it is a FEATURE, not a limitation.
- **NOT built (stay read-only, never homework):** GBP photo-refresh, category write-back, review-generation, booking connectors, PMS live connectors. (Confirms `project_alloro_built_vs_unbuilt_capabilities`.)

## The one correction that fixes all six (the FLIP)
Specs were written as "the recommendation is the product" (recommend the move = terminal = owner does it = homework). The 7/07 stake flips it: **for in-lane BUILT moves (GBP posts, review replies), the card ends in "Alloro drafted this, approve" -> "Alloro did it, here's the result" (attributed).** Threads Value #2 (no homework), NS2 (owned execution rail, provably exists for GBP), NS1-attributed, and the catch-22 (visible ROI) at once. For unbuilt rails (photos/category/booking/referral-call), the honest floor stays: read-only observation, never homework.

## Per-chapter verdicts + the specific edits
- **Ch2 Card Standard** — sharpen. Flip the "one move" to owner-commands / Alloro-executes-on-approval; name the two seats; change the done-for-you "non-goal" note to "authored-for, execution ships next." (Best-grounded chapter; the bar itself is right.)
- **Ch3 Findable** — sharpen. Route the freshness gap into the built GBP post/reply rail + attribute. PURGE FIX 4's example (owner-homework "add 4 photos" + relies on unbuilt GBP photo-refresh). Name two altitudes.
- **Ch4 Choosable** — sharpen (cleanest on scope + honesty). Add an attribution loop-back so the comparison compounds (re-read + attribute the delta). Name the operator altitude + NS1-attributed.
- **Ch5 Bookable** — **REWORK (the keystone), and it SPLITS** (sized on origin/dev/dave, below). **Ch5a RESPONDER = SMALL/in-lane** (achievable first increment of the owned rail); **Ch5b ATTRIBUTION (visitor->booking) = BIG BUILD** (the deep moat, sequence later). Own the response cures the operator's reconcile-nightmare (icp-spine §8.3). Current spec scopes the whole rail OUT; reframe to Ch5a-first.
- **Ch6 Memorable** — sharpen (most disciplined; zero out-of-lane violations). FLIP THE LADDER: done-for-you reply-gap (built, attributable) = PRIMARY, can't-execute velocity ask = secondary. Make the reply action a logged owned rail (the in-lane NS2 move). Strike the orphan "follow-up" word. Genericize velocity copy (never imply PMS patient knowledge).
- **Ch7 Verdict (capstone)** — sharpen. Attribution ENTIRELY missing (the first surface + the designated catch-22-breaker): weld "Alloro spotted this / Alloro did this" into the verdict + One Thing. Default the One Thing to done-for-you for in-lane domains (only the referral-call is a done-with-you handoff). Serve the operator altitude beneath the glance.

## Two threads fixed once, everywhere
1. **Attribution (NS1's "attributed" leg)** — absent across all 6. Weld it in; capstone (Ch7) first.
2. **Two-altitude (§8 owner glance + operator surface)** — collapsed everywhere ("owner opens the surface," but the owner won't log in; the operator touches it). Name both; §8.8 (operator's surface = owner's glance). Was deferred to the Value #2 fork (icp-spine §8.9), now unblocked.

## Ch5 rail sizing (RESOLVED 2026-07-07, verified on origin/dev/dave)
Ch5's rail is DIFFERENT from the GBP rail (both verified). It splits:
- **Ch5a RESPONDER = SMALL / in-lane.** Form-capture is BUILT (Alloro hosts the sites; submissions persist first to `website_builder.form_submissions` via `POST /api/websites/form-submission`). The submitter-email primitive already exists (newsletter double-opt-in). An instant lead auto-acknowledgement = a per-form toggle + a template on the existing send path. Owner-notify email is already live. Speed-to-lead (~21x qualify at 5-min) is the research-verified lever. A speed-to-lead TIMER/escalation is MODERATE (needs a queued job + SLA state), but a basic instant auto-ack is small.
- **Ch5b ATTRIBUTION (visitor->booking, first-party) = BIG BUILD.** NO booking/appointment entity exists anywhere in the codebase. `form_submissions` carries only `sender_ip`, no visitor/session id. Only aggregate `monthVisitors ÷ monthLeads` funnel math exists (`websiteMetrics.ts:286`), not per-record attribution. Needs three new pieces: a booking/outcome record, a visitor-id stamped on each submission, and the Rybbit-session -> submission -> booking join.
- **Do NOT mistake `leadgen_sessions` for this rail** — it is Alloro's OWN audit-tool acquisition funnel (audit visitor -> Alloro account), not the customer's patients or bookings.
- **In-lane line:** an instant transactional ack to a lead on Alloro's own hosted form (a lead the owner already earned) = in-lane. Any nurture/drip outbound AS the practice to a human = out-of-lane. Spec Ch5's responder as a single transactional auto-ack, never a drip.
- **Sequence: Ch5a first (the cheap owned-response increment, real value now), Ch5b as a deliberate big build.**

## Sources
6 per-chapter frame-validators + 1 GBP-write-path verifier (2026-07-07, this session). Per-chapter verdicts + receipts in the session transcript. Frame staked in `canon-to-stake.md` (Value #2 SPLIT + done-for-you definition); who-they-are in `library/canon/icp-spine.md` (§8 two-seat).
