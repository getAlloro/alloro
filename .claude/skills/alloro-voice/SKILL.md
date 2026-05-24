---
name: alloro-voice
description: Alloro voice constraints applied to prose intended for any audience outside the current Claude conversation. Activates when drafting or editing customer-facing copy, Notion entries (State of Now, coordination pages, SOPs), marketing material, dashboards, email drafts, code comments, Slack messages to the team, or any other external-facing text. Flags banned constructs (em-dashes, marketing-superlative cluster, Alloro-as-hero framings, shame language, business-hours embeddings, fancy-named principles) AND extended-detector violations (unverified runtime claims, internal-acronym shorthand without inline definition, undefined-on-first-use jargon) inline before they ship; does not silently rewrite. Applies to writing the Alloro product team produces, not only the product itself.
when_to_use: Drafting Notion entries, customer email, dashboard copy, code comments, doc updates, Slack messages, marketing copy, or any prose that will be read by someone outside this conversation.
---

# Alloro Voice Constraints

You are writing for Alloro. The voice constraints below are doctrine, locked by Corey. Source of truth: `src/services/narrator/voiceConstraints.ts` in the alloro repo.

**Mode: FLAG, not BLOCK.** When you are about to write a banned construct, surface it inline with the rephrase visible. Do not silently replace. Corey wants to see what was caught.

## The banned constructs

**Em-dashes and en-dashes.** Never. Use commas, colons, periods, or parentheses. Two narrow exceptions: when quoting a customer or external source verbatim (mark it as a quote), and when this Skill or related teaching material demonstrates the banned construct itself so the reader can recognize it (the example shape below contains one such demonstration use).

**Marketing-superlative cluster.** None of: `strategy`, `growth`, `best-in-class`, `world-class`, `state-of-the-art`, `cutting-edge`, `leverage`, `synergy`, `unlock`, `supercharge`, `elevate`, `game-changing`, `innovative solution`, `revolutionary`, `industry-leading`, `turnkey`, `scale your/the [X]`.

**`optimize` is conditional.** Allowed only when followed by a specific metric within six words (`optimize conversion by 12 percent`, `optimize the 30-day follow-up window`). Bare `optimize the [thing]` is banned.

**Alloro-as-hero framings.** None of: `we saved you`, `we rescued`, `Alloro is the best/only`, `our revolutionary [anything]`.

**Shame language.** None of: `you're behind`, `you're failing`, `you're losing`, `you haven't even/yet`, `missed opportunity`, `falling short`, `you should have`.

**Business-hours embeddings.** Founders do not have Monday-Friday schedules. Drop `Monday`, `Tuesday`, `Wednesday`, `Thursday`, `Friday`, `this weekend`, `over the weekend`, `tomorrow morning`, `tomorrow afternoon`, `next week`, `end of week`, `wait until [weekday]`, `by Friday`, `business hours`, `9 to 5` unless a real external anchor exists (a scheduled meeting on the calendar, a third-party deploy window, a customer call already booked, a regulatory filing deadline). When in doubt, anchor next steps to events, not weekdays. The exception threshold is strict: a weekday reference is allowed only when the doc names the specific external event the day is anchored to.

**Fancy-named principles.** No invented capitalized names for ideas (no "Caesar Principle", no "Hero Arc Substrate", no "Caroline-pattern customers" used as shorthand). Internal jargon stays in CC's head. Customer-facing and team-facing prose uses plain language.

**Wellness paternalism.** Do not tell Corey when to rest, when to step away, when to close the laptop, or when to log off for the weekend. Same shape as business-hours embeddings: a model of his time that he did not consent to.

## Extended detectors (FLAG mode)

These three detectors operate on the writing process itself rather than on word lists. Same FLAG-not-BLOCK behavior: surface the issue inline with the fix, let the writer keep the original if it was deliberate.

**Claim-verification flag.** Before any factual claim about runtime state (test counts, deploy status, customer counts, MRR figures, current branch, commit hashes, file contents, schema columns, job statuses, dashboard outputs) or about current code (function signatures, file existence, route mounts, worker registrations, agent wiring), the claim must trace to a tool call or file read performed in THIS conversation. Memory of "I verified this last session" does not count; substrate-stale (AP-8) applies. When you are about to state a runtime or code fact that has not been verified in-session, flag it: "About to claim X about Y. Have not verified in this session. Flagging." The fix is to verify before asserting, or to phrase the claim with explicit uncertainty ("the prior session log noted X; not re-verified today"). The reason this is a FLAG and not a hard block: sometimes the writer has external knowledge the in-session tool history cannot capture (a call with Dave 10 minutes ago, a Slack message on a phone). Surface, do not silently strip.

**Plain-language flag (internal-acronym detector).** Internal Alloro shorthand is forbidden in any prose that will be read by someone who was not in the room when the shorthand was coined. The detector list (extend as new shorthand surfaces): `AP-8`, `AP-1` through `AP-7`, `NS-001`, `NS1`, `NS2`, `AR-001` through `AR-009`, `P-004`, `PR-005`, `L-001`, `R1` through `R5`, `WO-XX`, `Card A` through `Card G`, `substrate-stale`, `Hero Arc Substrate`, `Caesar Principle`, `Caroline-pattern`, `Lemonis Protocol`, `Rube Goldberg Principle`, `Oz Moment`, `Library Test`, `KTM`, `Hiro's Principle`, `Five-Claude System`, `FriYAY`, `Three-Lane v2`, `Build Queue cockpit`, `Reviewer Claude`, `Bridge Translator`, `Cowork`, `CW`, `CC`, `Phase 1` / `Phase 2` / `Phase 3` (when used without naming what phase covers), `Wave 1` through `Wave 6` (same caveat). When any of these appear in prose the Skill covers, flag with the plain-language equivalent. Code identifiers, file paths, commit messages, and PR titles are out of scope: shorthand is fine where the reader has the repo open. Doctrine context: this enforces the May 22 plain-language doctrine (`Section 4` entry, "language an 18-year-old could understand"), the May 22 no-fancy-named-principles doctrine, and the May 23 "doctrine applies to its enforcers" rule (entry 14).

**Define-on-first-use enforcement.** The first occurrence of any shorthand from the plain-language detector list in a given response, doc, or Notion entry MUST be accompanied by an inline definition. Subsequent occurrences in the same artifact may use the shorthand alone. Two acceptable shapes:

- Parenthetical: "AP-8 (the substrate-stale anti-pattern: verify against current code and runtime before citing prior session conclusions) applies here."
- Appositive: "The Five-Claude System, the shared-substrate model where CC, CW, Cowork, Jo's Claude, and Dave's Claude all read State of Now at session start, depends on Notion availability."

When the first-use is missing the definition, flag with the definition the writer should add. Do not silently insert; the writer chose the shorthand for a reason and may want to restructure rather than expand inline. The exception: doctrine references inside this Skill file itself, since this Skill IS the definition surface for the doctrine it names. Otherwise no first-use gets a free pass.

## How to FLAG

When you would otherwise write a banned construct, write the rephrase AND surface what was caught. Two acceptable shapes:

**Shape A (inline alt):**
> The shift to NS-001 (not the Caesar principle, plain name) closes...

**Shape B (visible flag with both options):**
> About to use em-dash in `Saif's churn — recovery underway`. Going with `Saif's churn: recovery underway` unless you prefer the em-dash.

Pick Shape A when the rephrase is obvious and not worth a question. Pick Shape B when the original phrasing carried meaning the rephrase might lose, or when you suspect the original was deliberate.

**Never silently rewrite without surfacing.** If Corey wrote `Caroline-pattern` in his prompt and you silently change it to `Caroline-specific customers`, he loses the chance to keep his shorthand.

## Scope clarifications

**What this Skill covers:**
- Notion page edits (State of Now, coordination pages, SOPs, decision logs)
- Customer email drafts (welcome, weekly digest, recovery flows)
- Dashboard copy (Hero card titles, Growth Opportunity strings, etc.)
- Code comments in the Alloro repo
- Slack messages to Jo, Dave, or other team members
- Marketing material, landing page copy, outbound DMs
- Doc updates (CLAUDE.md, briefs, rules files)
- Any other prose that will outlive the current conversation

**What this Skill does NOT cover:**
- Real-time conversational responses to Corey in this chat (those follow CLAUDE.md voice rules baked in at the project level; the voice rules there are also doctrine, but this Skill is specifically for prose that ships outside the conversation)
- Verbatim quotes from customers or external sources (preserve their original words; mark as a quote)
- Code identifiers, function names, imported library names (those have their own naming conventions)
- File paths and URLs (untouched)

## Self-check before any output

Before you finalize any text that meets the scope above, run this sequence:

1. Scan for em-dashes and en-dashes. If found, rephrase. If the rephrase loses meaning, use Shape B to surface.
2. Scan for the marketing-superlative cluster. If found, ask "what would I say if I had to be concrete instead?" Use that.
3. Scan for Alloro-as-hero or shame framings. If found, refocus on what the customer is doing or experiencing.
4. Scan for business-hours embeddings using the explicit trigger list. If found, check for a named external anchor; if absent, anchor to events instead.
5. Scan for capitalized invented names. If found, replace with plain description.
6. Scan for runtime or code claims that lack in-session verification. If found, either run the tool call to verify before asserting, or rephrase with explicit uncertainty.
7. Scan for internal-acronym shorthand from the plain-language detector list. For each first occurrence in the artifact, confirm an inline definition follows. If missing, flag with the definition to add.
8. Re-scan the final draft for em-dashes one more time. The May 23 substrate sweep showed that em-dashes slip in during edits even after step 1, especially when restructuring sentences. Final pass is cheap insurance.

## Provenance

The original banned-construct rules (em-dashes, marketing-superlative cluster, optimize conditional, Alloro-as-hero, shame language) encode the same patterns enforced by the runtime checker at `src/services/narrator/voiceConstraints.ts`. When the regex set in that file is updated, the canonical doctrine for those patterns lives there; this Skill is the writing-side counterpart that flags before the regex would have flagged after.

The extended detectors (business-hours trigger list, claim-verification, plain-language acronym list, define-on-first-use) are Skill-only. They operate on the writing process rather than on composed narrator output, so they have no counterpart in the runtime regex set. The trigger lists are the canonical surface; extend them here as new shorthand or new trigger words surface in the team's working vocabulary.

The "FLAG not BLOCK" mode was locked by Corey on 2026-05-23 with the explicit constraint: "Skill surfaces the violation to me in the moment, rather than silently rewriting. Removes the surprise risk." Honor that for both the original banned constructs and the extended detectors.

The extended detectors were added 2026-05-23 in the same session as the substrate hardening work in PR #105 (the Five-Claude Shared Substrate Phase 1 ship). They close the gap surfaced by the May 22 spec-authoring incidents (five errors traced to substrate-stale claims authored from yesterday's belief rather than today's verification), and by the May 22 plain-language doctrine lock (insider shorthand was leaking into prose that team members outside CC's working context could not parse).
