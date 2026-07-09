# CoS Triage Agent, design spec (for the coherence/proof pass, 2026-07-08)

*The CoS should not just SURFACE open loops, it should TRIAGE them: auto-handle what an agent safely can, route what's delegable, escalate only the genuinely-Corey decisions. This spec is the end-to-end for an adversarial coherence pass. The pass DEFINES the safe auto-handle boundary (it answers "how much rope"), it is not decided by preference.*

## The flow (end-to-end)
1. CoS writes the daily brief + its "needs you" open items (existing routine, `trig_014P6tNA8cnasVwAVreqnYN8`).
2. **TRIAGE PASS:** classify each open item into a lane.
3. **GREEN (auto-handle):** reversible + internal + verifiable. Agent does it, shows its work + receipt, logs it.
4. **YELLOW (route):** needs a person's judgment. Agent drafts the delegation (to Dave / Jo) and surfaces it, does not sit on it.
5. **RED (escalate):** a decision only Corey can make. Surface to Corey; that is ALL his brief shows.
6. Corey's brief becomes: `handled: [...] · routed: [...] · your decisions: [1-2]`.

## The lane rules (DRAFT, to be hardened by the coherence pass)
- **GREEN examples (proven manually 2026-07-08):** resolve a doc/source-of-truth drift (the SEO fix), pull a live number, fix an internal inconsistency, reconcile-don't-twin, verify a claim against the live source.
- **YELLOW:** an item needing Dave's build judgment or Jo's ops judgment. Draft the handoff, route it.
- **RED (always escalate, NEVER auto-handle):** anything touching canon, pricing, the customer, outbound-to-a-human, money, an irreversible action, or a strategy/vision call.

## The safety gates (the AI-error-≤-human gate, staked 2026-07-08)
- Auto-handle ONLY reversible + verifiable. Never auto-stake canon, auto-send outbound, or auto-decide.
- ALWAYS show the work (each handle logged with reasoning + receipt).
- A periodic human audit of the auto-handled log, or it decays into a rubber-stamp (the exact CoS "report nobody reads" failure).
- Blast radius of a wrong auto-handle = a reversible internal fix, never a customer.

## What the coherence/proof pass must answer (the boundary is its OUTPUT, not an input)
Trace the end-to-end and find where auto-handling BREAKS:
- **Mis-classification:** an item classified GREEN that is actually RED, auto-handled when it should have escalated. (The core risk.)
- **Classifier error:** the triage judgment itself can be wrong, PROVEN on 2026-07-08 (the fabricated-#1 false alarm: an agent connected dots before collecting them). What stops a wrong classification from executing?
- **Reversibility misjudged:** an agent believes an action is reversible when it is not.
- **Compounding:** many small wrong auto-handles summing to a real mess.
- **Rubber-stamp:** show-your-work that no human actually audits.
The surviving GREEN set is the safe auto-handle boundary; everything the adversary breaks becomes escalate-always or a required guardrail.

## ⛔ COHERENCE-PASS RESOLUTION (the safe boundary, evidence-defined 2026-07-08, SUPERSEDES the DRAFT lane rules above)
Two fresh adversaries refuted the DRAFT GREEN set. Both converged: as drafted, auto-handle was UNSAFE, an admittedly-fallible classifier as the sole gate with NO read-only confirm between deciding and acting (the exact check that caught the 07-08 false alarm), and an "internal, never a customer" blast-radius bound that is FALSE in an agent-run repo.

**THE BOUNDARY: agents may auto-OBSERVE and auto-STAGE; they may NOT auto-COMMIT to truth; and they may NEVER edit what governs them.**

**GREEN (auto-execute, no human) ONLY when ALL hold:**
1. Read-and-report or append-to-STAGING (pull a live number, verify a claim against source, flag an inconsistency, DRAFT a fix). Writes ONLY to the brief/staging layer, tagged agent-originated-unconfirmed, NEVER to a doc-of-record, canon, memory, or the rules.
2. Carries a reversibility-RECEIPT (stored inverse op + pre-state + re-runnable source query), not a belief.
3. Touched path is NOT on the immutable list.
4. Deletes/retires NO copy; rests on NO inferred (uncollected) fact (the 07-08 lesson).
5. Under the rate + cumulative-drift caps AND the prior batch's audit gate is cleared.

**ESCALATE-ALWAYS (bypasses the classifier; a CODE-LEVEL immutable-path list):** the triage rules / lane defs / safety gates themselves; canon; memory + the memory index; grounding / START-HERE substrate; any dedup that DELETES or RETIRES a copy; any customer-surface string; any outbound-to-a-human; any money; any DB write / backfill / migration; any deploy; any capability claim; anything resting on an inferred fact.

**Everything the DRAFT called GREEN that WRITES to truth (reconcile copies, fix inconsistencies IN docs-of-record, correct numbers INTO authoritative docs, "resolve a drift") = propose-and-route (YELLOW), NOT execute.**

**Load-bearing guardrails (ranked):**
1. **Mechanical (code-level) self-modification ban + immutable-path list.** The agent physically cannot write the rules / canon / memory / grounding / guardrails; attempts route to escalate. NOT a prompt instruction (a prompt is itself a doc the agent could rationalize around).
2. **Mandatory read-only confirm before any handle**, receipt captured BEFORE the act (the check that caught 07-08).
3. **Write-to-staging, not write-to-truth**, plus a provenance tag on every auto-write, so a wrong auto-edit cannot masquerade as human-staked truth to the next agent.
4. **The audit is a blocking GATE, not a report.** Auto-handling is PAUSED by default and EARNED by a cleared audit; skipping the audit stalls the line, it does not silently pass (the only structure that survives the CoS's own "report nobody reads" failure).
5. **Rate + cumulative-drift caps** (halt if more than X source-docs touched before an audit clears).
6. Default-to-escalate on ANY ambiguity; confidence is never a green-light.

**The deepest catch (why "internal" is not a firewall):** in an agent-run repo, internal doc/memory/canon edits are INPUTS to the next agent's outward action, so "internal" is a PIPELINE to external harm, not a bound on it. The self-modifying-context risk (an agent editing the rules/memory/grounding that govern future decisions, reversibly, with a receipt, widening its own rope) is the deadliest class and was absent from the DRAFT. The code-level immutable-path ban closes it.

## The fix-the-system GATE, coherence-defined 2026-07-08 (refutes the prose-heavy first draft)
An adversary refuted the first gate design (edit-time tells + a triage checkbox + AAR-prose) as mostly theater: the problem is a JUDGMENT failure by an agent that ALREADY held the written principle, so more written prose fails the same way. The enforceable minimal gate:
1. **Harness-owned pre-edit hook (mechanical, narrow):** a `settings.json` pre-edit hook the HARNESS runs (not a skill instruction the agent must remember) that HARD-STOPS only when an edit touches a **canonical-phrase registry** (the guarantee line, the price, the ICP claim, the positioning promise). Low-noise, objective, aimed at the offer/claim class that recurs. A "grep any string" version is noise -> alarm-fatigue -> click-through (the "report nobody reads" failure); registry-scoping avoids it.
2. **Single-source (remove, don't police):** single-source the canonical claims (e.g. the offer) so the N copies cannot exist. An architecture where the instance is impossible beats a gate that catches it. This IS the #25 offer-reconciliation, the same work.
3. **Triggered coherence-handoff (a second instrument, not a self-check):** "is this one node of a system?" (the website miss) cannot be self-judged by the agent doing the fix. A fix on a **customer-facing asset** (live site, landing page) routes, by a harness-detectable condition, to a mandatory system-altitude coherence review BEFORE it is enacted. This IS the website track (#26) + the triage's escalate-to-a-second-instrument.
DELETE as "enforcement": free-form tells, a self-filled triage checkbox, AAR-prose-sharpening, they document intent, they do not gate. AAR-compounding only helps when its output is a NEW mechanical rule (a new registry phrase, a new hook), never better wording.
