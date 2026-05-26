---
name: alloro-voice
description: Alloro voice constraints applied to prose intended for any audience outside the current Claude conversation. Activates when drafting or editing customer-facing copy, Notion entries (State of Now, coordination pages, SOPs), marketing material, dashboards, email drafts, code comments, Slack messages to the team, or any other external-facing text. Flags banned constructs (em-dashes, marketing-superlative cluster, Alloro-as-hero framings, shame language, business-hours embeddings, fancy-named principles) AND extended-detector violations (unverified runtime claims, internal-acronym shorthand without inline definition, undefined-on-first-use jargon, anti-proliferation check before coining new named references, internal named-reference shorthand in substrate, Decision-Log-first check when locking new doctrine, Anti-Pattern Log surface before mass substrate writes) inline before they ship; does not silently rewrite. Applies to writing the Alloro product team produces, not only the product itself.
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

These seven detectors operate on the writing process itself rather than on word lists. Same FLAG-not-BLOCK behavior: surface the issue inline with the fix, let the writer keep the original if it was deliberate.

**Claim-verification flag.** Before any factual claim about runtime state (test counts, deploy status, customer counts, MRR figures, current branch, commit hashes, file contents, schema columns, job statuses, dashboard outputs) or about current code (function signatures, file existence, route mounts, worker registrations, agent wiring), the claim must trace to a tool call or file read performed in THIS conversation. Memory of "I verified this last session" does not count; substrate-stale (AP-8) applies. When you are about to state a runtime or code fact that has not been verified in-session, flag it: "About to claim X about Y. Have not verified in this session. Flagging." The fix is to verify before asserting, or to phrase the claim with explicit uncertainty ("the prior session log noted X; not re-verified today"). The reason this is a FLAG and not a hard block: sometimes the writer has external knowledge the in-session tool history cannot capture (a call with Dave 10 minutes ago, a Slack message on a phone). Surface, do not silently strip.

**Plain-language flag (internal-acronym detector).** Internal Alloro shorthand is forbidden in any prose that will be read by someone who was not in the room when the shorthand was coined. The detector list (extend as new shorthand surfaces): `AP-8`, `AP-1` through `AP-7`, `NS-001`, `NS1`, `NS2`, `AR-001` through `AR-009`, `P-004`, `PR-005`, `L-001`, `R1` through `R5`, `WO-XX`, `Card A` through `Card G`, `substrate-stale`, `Hero Arc Substrate`, `Caesar Principle`, `Caroline-pattern`, `Lemonis Protocol`, `Rube Goldberg Principle`, `Oz Moment`, `Library Test`, `KTM`, `Hiro's Principle`, `Five-Claude System`, `FriYAY`, `Three-Lane v2`, `Build Queue cockpit`, `Reviewer Claude`, `Bridge Translator`, `Cowork`, `CW`, `CC`, `Phase 1` / `Phase 2` / `Phase 3` (when used without naming what phase covers), `Wave 1` through `Wave 6` (same caveat). When any of these appear in prose the Skill covers, flag with the plain-language equivalent. Code identifiers, file paths, commit messages, and PR titles are out of scope: shorthand is fine where the reader has the repo open. Doctrine context: this enforces the May 22 plain-language doctrine (`Section 4` entry, "language an 18-year-old could understand"), the May 22 no-fancy-named-principles doctrine, and the May 23 "doctrine applies to its enforcers" rule (entry 14).

**Define-on-first-use enforcement.** The first occurrence of any shorthand from the plain-language detector list in a given response, doc, or Notion entry MUST be accompanied by an inline definition. Subsequent occurrences in the same artifact may use the shorthand alone. Two acceptable shapes:

- Parenthetical: "AP-8 (the substrate-stale anti-pattern: verify against current code and runtime before citing prior session conclusions) applies here."
- Appositive: "The Five-Claude System, the shared-substrate model where CC, CW, Cowork, Jo's Claude, and Dave's Claude all read State of Now at session start, depends on Notion availability."

When the first-use is missing the definition, flag with the definition the writer should add. Do not silently insert; the writer chose the shorthand for a reason and may want to restructure rather than expand inline. The exception: doctrine references inside this Skill file itself, since this Skill IS the definition surface for the doctrine it names. Otherwise no first-use gets a free pass.

**Anti-proliferation: canonical-name-first (new 2026-05-26).** Before introducing a new named reference, metaphor, or analogy, check whether a canonical term already exists in the Decision Log. The pattern that brought this rule into being: between March and May 2026, individual Claude sessions coined `Wright Brothers Rule` while `$10B ambition ceiling` was already locked in canon; coined `Harry Hogge` as a role metaphor when `crew chief` describes the same thing in plain language; treated `Calistoga Standard` as if it were a North Star when Decision NS-001 had already demoted it to a subordinate Test. The May 26, 2026 substrate cleanup deleted hundreds of these. The substrate-language guard below catches them backward (don't ship existing jargon in substrate); this rule catches them forward (don't coin new jargon when canon already covers it).

Detection patterns (conservative; trigger only on the shapes that historically produced proliferation):

- Multi-word capitalized noun phrases ending in canonical-name suffixes: `Rule`, `Doctrine`, `Standard`, `Principle`, `Gate`, `Test`, `Moment`, `Trap`, `Protocol`, `Engine`, `Layer`, `Loop`, `Mode`. These are the shapes Alloro has historically used for named concepts.
- Phrases of the form `the X principle`, `the X rule`, `the X doctrine`, `the X standard`, `the X gate`, `the X test`, `the X protocol`, where X is a proper-noun-shaped coinage not already in the Decision Log.
- Explicit metaphor markers in the same sentence as a capitalized phrase: `X is like Y`, `X is the Alloro version of Y`, `inspired by X`, `borrowed from X` where the framing treats X as a load-bearing concept.
- Capitalized two-to-four-word phrases used as if they were defined terms (the writer is treating them as load-bearing concepts but they have no Decision Log entry).

When any of these patterns appear, surface inline: `Anti-proliferation check: about to introduce '<phrase>'. Does a canonical term exist for this concept in the Decision Log? If yes, use it. If no, propose adding to the Decision Log entry before coining a new reference in substrate.`

Same FLAG-not-BLOCK behavior. The writer may have a deliberate reason (the concept is genuinely new and a Decision Log entry is forthcoming, the phrase is a verbatim quote, the writing surface IS the canonical definition for the concept, the phrase is an established external reference). FLAG surfaces the check; the writer decides whether to defer to canon, file a Decision Log entry first, or proceed with acknowledgement.

Detection tuning is intentionally conservative. False positives on every capitalized noun phrase would create unmanageable friction. Trigger only on the canonical-name-suffix list and explicit metaphor markers above, and only when the phrase is being USED as a load-bearing concept (not just mentioned in passing prose).

Exempt by design: the Skill file itself describing the patterns it catches (this paragraph names canonical-name suffixes by way of definition); doctrine pages that ARE the canonical surface for the concept they introduce; verbatim conversation excerpts; established external references (`Storybrand`, `EOS`, named books, named frameworks credited to external authors with no Alloro-canon equivalent).

Rule context: this rule closes the forward direction the May 26 substrate cleanup left open. PR #107 added the substrate-language guard (backward direction). This rule (forward direction) completes the pair. References: Session Start Canonical Read Protocol at https://www.notion.so/36cfdaf120c481a18d4ed059b647366b ensures the Decision Log is loaded before any session that could coin; Verification Gate Pre-Write Extension at https://www.notion.so/35ffdaf120c48199b7c2f7d42e1adffa catches drift before substrate writes ship; this Skill rule catches coinage at the moment of authoring.

**Decision Log forward gate (new 2026-05-26).** Detect when a session is about to lock new doctrine, decision, or principle in substrate. When detected, prompt the writer to file a Decision Log entry first, then write substrate.

Detection patterns (FLAG mode):

- Explicit lock language: phrases like `lock this`, `locked in`, `locked decision`, `from now on`, `going forward we`, `doctrine entry`, `new principle`, `decision locked`, `permanent rule`.
- Any substrate write that introduces a new named pattern (caught earlier by the anti-proliferation rule above) AND the writer signals canonical intent (the phrase appears in a Notion page header, a decision log addendum, a CLAUDE.md edit, a PR description framed as `lock`, or similar).
- New numbered decision IDs not already in the Decision Log canon (e.g., proposing `AR-011`, `P-005`, `NS-002` content without first filing the Decision Log entry).

When any of these appear, surface: `Decision Log gate: about to lock new doctrine. The Decision Log at https://www.notion.so/327fdaf120c4816093cdd4c75d2cc6a6 is the canonical surface for locked decisions. Propose the Decision Log entry first (so the canonical name and rationale exist), then write substrate that references it. Otherwise the next cleanup will sweep this language as accumulated coinage.`

Rationale: the May 26 substrate cleanup deleted hundreds of named references that should have been Decision Log entries but weren't, because each session that coined them did so without going through the Decision Log gate. The anti-proliferation rule above catches the act of coining a name; this rule catches the act of locking new canon. Two different shapes of the same failure mode. FLAG-not-BLOCK, same as the others. Writer's judgment.

**Anti-Pattern Log surface at write time (new 2026-05-26).** Before any substrate write at scale (Notion DB updates greater than 5 rows in one operation, page replace/update touching greater than 50% of page content, repo PR creation, marketing copy publication, mass row updates), the Skill surfaces relevant Anti-Pattern Log entries the writer should check against.

Surface trigger: any substrate write at the scale defined above. Before executing, the Skill notes which Anti-Pattern Log entries (at https://www.notion.so/35ffdaf120c48112ba86c4991cc78a08) apply to the type of write being made.

Mapping (extend as the Anti-Pattern Log grows):

- **Repo PR creation, engineering write**: AP-2 (orphaned code, verify the change is wired), AP-5 (superseded files, delete the old one in the same commit), AP-6 (credentials in commits, scan the diff), AP-7 (specs-from-memory, verify against actual codebase paths), AP-8 (substrate-stale, verify source docs were re-read in-session).
- **Notion DB mass write, doctrine page edit**: AP-1 (Build State drift, verify the doc you're modifying matches code reality), AP-7 (specs-from-memory), AP-8 (substrate-stale, verify Decision Log and Drift Register entries are current).
- **Customer-facing copy, marketing publication**: AP-1 (drift between stated and shipped), AP-7 (claims from memory), AP-8 (stale substrate referenced in claims), plus the alloro-voice doctrine itself.
- **Agent .md file edit, Skill edit, lattice edit**: AP-3 (sub-agents don't inherit CLAUDE.md @imports, include inline if needed), AP-4 (registered-not-running, verify the agent has an active scheduler path), AP-8 (substrate-stale).

When triggered, surface: `Anti-Pattern Log surface: about to <write type>. Relevant Anti-Patterns to verify against: <list>. Brief check before proceeding. Anti-Pattern Log: https://www.notion.so/35ffdaf120c48112ba86c4991cc78a08`

Rationale: the Anti-Pattern Log exists but had no mechanism to surface relevant patterns AT the moment of a write that risks them. Lessons learned without lessons applied is the failure mode this rule closes. FLAG-not-BLOCK; the writer acknowledges the check and decides whether to apply or override.

**Substrate language: internal named references (new 2026-05-25).** Substrate (Notion pages, code comments, public docs, customer-facing copy) speaks plain English. Internal named references stay in chat and user memory; in substrate they get defined inline on first use or replaced with a plain-language equivalent. The detector list (case-insensitive; whole-word where the host context supports it, otherwise plain substring; extend as new named references surface in the team's working vocabulary):

- `Wright Brothers Rule`
- `Pistorius doctrine`
- `Harry Hogge`
- `Cole Trickle`
- `Sophie Test`
- `Calistoga Standard`
- `Rice Cooker`
- `Caesar Milan` (and the alternate spelling `Cesar Milan`)
- `SSL moment`
- `Klein pre-mortem`
- `Confidence Code` (only when capitalized as a proper noun; lowercase `confidence` and the generic phrase `confidence code` are fine)
- `The Standard` (only when capitalized as a proper noun and used as a stand-alone reference; ordinary phrases like `the standard practice` are fine)
- `BLIMEY`
- `FYM`
- `Freedom Delivered`

When any of these appear in substrate prose the Skill covers, surface inline: "Internal named reference detected: [term]. Substrate uses plain English; define inline on first use or replace with plain-language equivalent." Same FLAG-not-BLOCK behavior as the other extended detectors. The writer may have a deliberate reason (a Notion page that IS the definition surface for the term, this Skill file itself, a verbatim conversation excerpt) and gets to keep the original by acknowledging the flag.

Deliberately excluded from this trigger list: `Maven`. The disambiguation cost between the Gladwell concept and Apache Maven (the Java build tool) outweighs the value of catching it here. Handled as manual review if it surfaces during a substrate scan.

This rule is the named-reference partner to the plain-language flag above (which targets acronym shorthand) and the no-fancy-named-principles rule under banned constructs. Same doctrine, different shape: where the plain-language flag catches `AP-8` and `NS-001`, this rule catches `Wright Brothers Rule` and `Pistorius doctrine`. Together they close the named-reference surface area of the May 22 plain-language doctrine. Rule added 2026-05-25 from the substrate language audit decision.

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
8. Anti-proliferation check: scan for multi-word capitalized noun phrases ending in canonical-name suffixes (Rule, Doctrine, Standard, Principle, Gate, Test, Moment, Trap, Protocol, Engine, Layer, Loop, Mode) and for `the X principle/rule/doctrine/...` constructions where X is a proper-noun coinage. For each hit, check whether the concept already has a canonical Decision Log entry. If yes, surface the canonical name and prefer it. If no, surface the FLAG and ask whether to file a Decision Log entry before coining in substrate.
9. Decision Log gate: scan for explicit lock language (`lock this`, `locked decision`, `from now on`, `new principle`, `permanent rule`, etc.) and for new numbered Decision IDs not already in the Decision Log canon. If found, surface the FLAG and ask whether to file the Decision Log entry first.
10. Anti-Pattern Log surface: if this output is a substrate write at scale (Notion DB write greater than 5 rows, page replace touching greater than 50%, repo PR creation, marketing copy publication, or any mass row update), list the relevant Anti-Pattern Log entries the writer should verify against before proceeding.
11. Scan for internal named-reference shorthand from the substrate-language detector list. For each occurrence, surface the FLAG message and let the writer decide (define inline, replace with plain language, or keep with acknowledgement). Skip occurrences inside the documented exemptions.
12. Re-scan the final draft for em-dashes one more time. The May 23 substrate sweep showed that em-dashes slip in during edits even after step 1, especially when restructuring sentences. Final pass is cheap insurance.

## Provenance

The original banned-construct rules (em-dashes, marketing-superlative cluster, optimize conditional, Alloro-as-hero, shame language) encode the same patterns enforced by the runtime checker at `src/services/narrator/voiceConstraints.ts`. When the regex set in that file is updated, the canonical doctrine for those patterns lives there; this Skill is the writing-side counterpart that flags before the regex would have flagged after.

The extended detectors (business-hours trigger list, claim-verification, plain-language acronym list, define-on-first-use, anti-proliferation canonical-name-first, Decision Log forward gate, Anti-Pattern Log surface at write time, substrate language named-reference list) are Skill-only. They operate on the writing process rather than on composed narrator output, so they have no counterpart in the runtime regex set. The trigger lists are the canonical surface; extend them here as new shorthand or new trigger words surface in the team's working vocabulary.

The "FLAG not BLOCK" mode was locked by Corey on 2026-05-23 with the explicit constraint: "Skill surfaces the violation to me in the moment, rather than silently rewriting. Removes the surprise risk." Honor that for both the original banned constructs and the extended detectors.

The extended detectors were added 2026-05-23 in the same session as the substrate hardening work in PR #105 (the Five-Claude Shared Substrate Phase 1 ship). They close the gap surfaced by the May 22 spec-authoring incidents (five errors traced to substrate-stale claims authored from yesterday's belief rather than today's verification), and by the May 22 plain-language doctrine lock (insider shorthand was leaking into prose that team members outside CC's working context could not parse).

The substrate language named-reference detector was added 2026-05-25 from Corey's substrate language audit decision. It complements the May 23 plain-language extension by catching the parallel named-principle shorthand surface (Wright Brothers Rule, Pistorius doctrine, and related) that was leaking into substrate alongside the acronym shorthand the earlier rule already covers. Phase A of the audit (this rule, locked as forward guard); Phase B audits accumulated debt across existing Notion substrate; Phase C executes approved replacements.

The anti-proliferation canonical-name-first detector was added 2026-05-26 as the follow-on to PR #107. PR #107 closed the backward direction (don't ship existing jargon in substrate). This rule closes the forward direction (don't coin new jargon at all when canon already covers it). The May 26 cleanup session surfaced the failure mode: individual Claude sessions had been coining named references and analogies for six weeks without back-porting to canon or checking whether canonical terms existed. The cleanup deleted hundreds of accumulated coinages. This rule prevents the next round. Paired with the Session Start Canonical Read Protocol (Notion page at 36cfdaf120c481a18d4ed059b647366b, locked 2026-05-26) and the Verification Gate Pre-Write Extension (locked 2026-05-26 on the existing Verification Gate page 35ffdaf120c48199b7c2f7d42e1adffa), the three pieces form structural closure: read canon first, check canon before coining, verify alignment before substrate writes.

The Decision Log forward gate and Anti-Pattern Log surface at write time detectors were added 2026-05-26 as the follow-on to the anti-proliferation rule. Anti-proliferation catches the act of coining a name; Decision Log gate catches the act of locking new canon; Anti-Pattern Log surface catches lessons-learned-but-not-applied at the moment of any substrate write at scale. Same failure-mode family, three different shapes. Forward-generation prevention layer on top of the cleanup work the May 26 substrate audit completed. All three remain FLAG-not-BLOCK; writer's judgment.
