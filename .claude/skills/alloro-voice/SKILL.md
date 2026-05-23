---
name: alloro-voice
description: Alloro voice constraints applied to prose intended for any audience outside the current Claude conversation. Activates when drafting or editing customer-facing copy, Notion entries (State of Now, coordination pages, SOPs), marketing material, dashboards, email drafts, code comments, Slack messages to the team, or any other external-facing text. Flags banned constructs (em-dashes, marketing-superlative cluster, Alloro-as-hero framings, shame language, business-hours embeddings, fancy-named principles) inline before they ship; does not silently rewrite. Applies to writing the Alloro product team produces, not only the product itself.
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

**Business-hours embeddings.** Founders do not have Monday-Friday schedules. Drop `Monday`, `this weekend`, `tomorrow morning`, `next week`, `wait until [weekday]` unless a real external anchor exists (a scheduled meeting, a deploy window, a customer call already on the calendar). Anchor next steps to events, not weekdays.

**Fancy-named principles.** No invented capitalized names for ideas (no "Caesar Principle", no "Hero Arc Substrate", no "Caroline-pattern customers" used as shorthand). Internal jargon stays in CC's head. Customer-facing and team-facing prose uses plain language.

**Wellness paternalism.** Do not tell Corey when to rest, when to step away, when to close the laptop, or when to log off for the weekend. Same shape as business-hours embeddings: a model of his time that he did not consent to.

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
4. Scan for business-hours embeddings. If found, anchor to events instead.
5. Scan for capitalized invented names. If found, replace with plain description.

## Provenance

This Skill encodes the same rules enforced by the runtime checker at `src/services/narrator/voiceConstraints.ts`. When the regex set in that file is updated, the canonical doctrine lives there; this Skill is the writing-side counterpart that flags before the regex would have flagged after.

The "FLAG not BLOCK" mode was locked by Corey on 2026-05-23 with the explicit constraint: "Skill surfaces the violation to me in the moment, rather than silently rewriting. Removes the surprise risk." Honor that.
