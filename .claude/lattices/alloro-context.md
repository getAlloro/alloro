# Alloro Context — Lattice Load Surface

The substrate every Alloro Claude session loads. Four lattices plus standing rules and audit findings.

## Lattices (loaded inline)

@.claude/lattices/product-outline.md
@.claude/lattices/journey-lattice.md
@.claude/lattices/sentiment-lattice.md
@.claude/lattices/knowledge-lattice.md

**Product Outline** = the May 18, 2026 canon — what Alloro is, the two surfaces (Connect, Reflect), the three Beliefs, the ICP (local service business owner), pricing (P-004: $2,000 per location flat), the two North Stars with decision filter, vocabulary. Read first when the question is *what does Alloro do*. **Journey Lattice** = customer-journey vocabulary and five stages; read when the question is *what to say to the owner*. **Sentiment Lattice** = voice and posture; read when the question is *how the surface should feel*. **Knowledge Lattice** = operating heuristics from leaders, companies, and failures; read when the question is *how to act*.

## Four Standing Rules (from CLAUDE.md)

1. **Never push to main directly.** Dave owns the merge. CC never pushes to main.
2. **Never commit credentials.** Any secret in a diff is a stop.
3. **No fabricated content (PR-005).** Every claim traces to verified data. If the data isn't there, the claim isn't either.
4. **One feature = one commit = one verifiable step.** TSC clean, build clean, tests green, proof file at `/tmp/` before Dave reviews.

## Four Locked Audit Findings (May 13–14, 2026)

Background facts from the lattice-loading audit:

1. **Build State drift.** CLAUDE.md prose drifts faster than the code. When doc and code disagree, the code is truth; update the doc.
2. **Sub-agent inheritance constraint.** Sub-agents launched via the Agent tool do NOT inherit CLAUDE.md @imports. Every sub-agent prompt that needs lattice context must include it inline. The 39 agents in `.claude/agents/` that recite "query the Lattice" by Notion URL have no execution path to fetch it.
3. **Lattice loading at zero percent across product surfaces.** Narrator, Site QA gates, Standard Rubric, Weekly Digest, Reveal Email/Choreography do NOT load lattice content at runtime. Only `agentRuntime.ts`, `intelligenceAgent.ts`, and `bookOutline.ts` consume the `knowledge_heuristics` table.
4. **Hardcoded voice rules.** `src/services/narrator/voiceConstraints.ts` and `src/services/reveal/emailTemplate.ts` "encode the Sentiment Lattice" via regex constants, not runtime reads. Voice changes require code changes. Re-anchor surfaces to this static substrate before adding dynamic loading.

## Posture

When in doubt, the Journey Lattice line decides: *does this make the owner feel understood before it makes them feel informed?* If not, rewrite before shipping.
