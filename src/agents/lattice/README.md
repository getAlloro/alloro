# Agent Knowledge Injection — the one fixed path

**If you are asking "how does a master's framework (Cialdini, Schwartz, Sheridan…) actually reach a live Alloro agent?" — this is the answer. You are in the right place. Do not re-derive it.**

A validated master rubric only changes agent behavior when it lives where the agent's prompt loader reads **and the agent's own call site asks for the composed prompt**. Everything else — the lattice library, a private rubric doc, a wiki page — is a reference nothing loads. This directory is the single place where a rubric crosses from *reference* into *enforced runtime instruction*.

## The path (always the same)

```
library (source of truth)            held outside this repository — ask the owner
        │  distilled + canon-checked
        ▼
this dir  src/agents/lattice/*.md    validated fragments that SHIP with the product
        │
registry  src/agents/lattice/loadout.ts   AGENT_LATTICE_LOADOUT: { agentPath -> [fragmentKey] }
        │
composer  service.prompt-loader.ts    loadAgentPrompt(agentPath) = base prompt + mapped fragments
        │
call site the agent's own runner       MUST call loadAgentPrompt() / runComposedAgent()
        │
enforced  src/__tests__/agent-prompt-composition.test.ts   remove a mapping -> suite goes red
          src/__tests__/lattice-callsite-wiring.test.ts    bypass the call site -> suite goes red
```

## To make a master live (four steps — nothing else)

1. Add a validated, canon-conformant fragment here: `src/agents/lattice/{key}.md`
   (distilled from the library; no retired vocabulary, no guarantees per Value #6, no ad/campaign framing).
2. Add one row to `loadout.ts`: `"{agentPath}": ["{key}"]`.
3. Add one assertion to `src/__tests__/agent-prompt-composition.test.ts`.
4. **Switch that agent's production call site** from `loadPrompt(...)` to `loadAgentPrompt(...)` — or route it through `runComposedAgent(...)`.

### Why step 4 exists (do not skip it)

Steps 1–3 all pass while the rubric never reaches the running agent. The composition test calls `loadAgentPrompt()` directly, so it goes green regardless of what the live call site does — and most call sites in `src/` still use bare `loadPrompt()`. A mapped agent loaded that way is a **silent no-op**: green suite, unchanged behavior.

`lattice-callsite-wiring.test.ts` closes that hole. It fails, naming the exact `file:line`, if any agent mapped in `AGENT_LATTICE_LOADOUT` is still loaded through bare `loadPrompt()`.

An agent with no registry row is unaffected — its prompt is byte-identical to `loadPrompt()`. A mapped-but-missing fragment throws at load time (fail loud), never degrades silently.

## Currently wired

| Master | Fragment | Agent | Call site (step 4) |
| --- | --- | --- | --- |
| Cialdini — honest influence | `cialdini-honest-influence.md` | `auditAgents/gbp/TrustEngagement` | `runComposedAgent` — `src/workers/processors/auditLeadgen.processor.ts:518` ✅ |

## Queued (each = the four steps above)

Both targets are currently loaded through bare `loadPrompt()`, so each needs step 4 as well as steps 1–3:

- Schwartz (5 Stages of Awareness) → `websiteAgents/SeoGeneration` — call site `src/controllers/admin-websites/feature-utils/util.seo-section-runner.ts:105`
- Sheridan (They Ask, You Answer / Big 5) → `auditAgents/WebsiteAnalysis` — call site `src/workers/processors/auditLeadgen.processor.ts:257`
