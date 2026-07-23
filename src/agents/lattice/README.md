# Agent Knowledge Injection — the one fixed path

**If you are asking "how does a master's framework (Cialdini, Schwartz, Sheridan…) actually reach a live Alloro agent?" — this is the answer. You are in the right place. Do not re-derive it.**

A validated master rubric only changes agent behavior when it lives where the agent's prompt loader reads. Everything else — the lattice library, a private rubric doc, a Notion page — is a reference nothing loads. This directory is the single place where a rubric crosses from *reference* into *enforced runtime instruction*.

## The path (always the same)

```
library (source of truth)            alloro-brain/library/lattices/*.md   (git-tracked; Notion retired)
        │  distilled + canon-checked
        ▼
this dir  src/agents/lattice/*.md    validated fragments that SHIP with the product
        │
registry  src/agents/lattice/loadout.ts   AGENT_LATTICE_LOADOUT: { agentPath -> [fragmentKey] }
        │
composer  service.prompt-loader.ts    loadAgentPrompt(agentPath) = base prompt + mapped fragments
        │
enforced  src/__tests__/agent-prompt-composition.test.ts   remove a mapping -> suite goes red
```

## To make a master live (three steps — nothing else)

1. Add a validated, canon-conformant fragment here: `src/agents/lattice/{key}.md`
   (distilled from the library; no retired vocabulary, no guarantees per Value #6, no ad/campaign framing).
2. Add one row to `loadout.ts`: `"{agentPath}": ["{key}"]`.
3. Add one assertion to `src/__tests__/agent-prompt-composition.test.ts`.

An agent with no registry row is unaffected — its prompt is byte-identical to `loadPrompt()`. A mapped-but-missing fragment throws at load time (fail loud), never degrades silently.

## Currently wired

| Master | Fragment | Agent |
| --- | --- | --- |
| Cialdini — honest influence | `cialdini-honest-influence.md` | `auditAgents/gbp/TrustEngagement` |

## Queued (each = the three steps above)

- Schwartz (5 Stages of Awareness) → `websiteAgents/SeoGeneration`
- Sheridan (They Ask, You Answer / Big 5) → `auditAgents/WebsiteAnalysis`
