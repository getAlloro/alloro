# AEO / AI-visibility tracking, landscape signals

Light market signals about who's building tools to MEASURE how brands show up in AI answers. Directional corroboration of the AEO timing bet, NOT load-bearing intel. Strengthens (does not replace): project_ai_visibility_measurement (Recognition Tri-Score), project_competitive_intel, and the AEO timing bet (continuity ledger + project_why_now_ai_covid_accelerator).

## STAT AI Brand Visibility (Moz), filed 2026-07-07
- **Weight: LOW.** Source = a sponsored marketing email (Search Engine Journal / STAT). The getstat.com/de-brand-visibility-tracking link would not fetch, so this is from the email PDF only.
- **What it is:** STAT (Moz's SERP-tracker) added "AI Brand Visibility", it tracks how a brand appears in AI search (ChatGPT, Gemini, AI Mode; Claude/Perplexity "on the way"): how early/often the brand is mentioned in LLM responses, benchmark vs rivals, the full generated response + every source cited, brand sentiment, and GEO prompt-suggestions. Combines SERP + LLM tracking. ~$360/mo (3,000 weekly prompts / daily keyword quota).
- **Target user:** SEO pros / agencies (self-serve dashboard).
- **The signal (why keep it):** even the incumbent SEO-trackers are now racing to build AI-brand-visibility tracking, corroborates the AEO timing bet (the front door shifting to AI answers; the tooling market forming right now).
- **The distinction (the moat cut):** STAT sells the GAUGE CLUSTER, a measurement dashboard, to EXPERTS who read data, the TrainerRoad/Zwift end. Alloro's AI-visibility is DONE-FOR-YOU for local OWNERS who want handled, not a dashboard, the Peloton end. Same AEO space, opposite ends. STAT is NOT a direct competitor for Alloro's ICP (a local owner won't buy a $360/mo GEO dashboard); it's a landscape marker + a reference for what AI-visibility measurement offers.

## AEO reality / tactics signals (not tracking tools)

### Clovion: 62% of AI brand recommendations vanish after ONE buyer follow-up, filed 2026-07-07
- **Source:** Search Engine Journal reporting Clovion AI (Oslo) data. **Weight: MEDIUM-HIGH** — largest-sample AEO datum in the note (69,120 multi-turn conversations across ChatGPT, Claude, Gemini; 36 B2B software/fintech categories).
- **The finding:** Ask "best CRM tools?" then add one ordinary buyer detail ("for a small team") and only **28%** of the originally-recommended brands survive to the second answer — 62% vanish. Repeating the SAME question (no new context) retains 90%, so the drop is specifically caused by buyer context, not model randomness. Per-model: Claude/ChatGPT tend to UNDERSTATE features, Gemini OVERCLAIMS (330 verified contradictions) — each model pulls different sources.
- **The signal (why keep it):** the money line = "being initially recommended isn't being trusted." First-answer visibility is fragile; the win is surviving the SPECIFIC, contextualized question a real buyer asks. Corroborates the AEO bet AND sharpens it: the job isn't "get mentioned once," it's be the recommendation that HOLDS when the prompt gets specific — and it must be optimized per-platform, factual-corrections first. Directly relevant to Alloro's AI-visibility product framing (Recognition Tri-Score) — a one-shot mention metric would overstate real standing.

### Google (Mueller): don't build a separate markdown/"agent-friendly" site for AI SEO, filed 2026-07-07
- **Source:** Search Engine Journal quoting Google's John Mueller. **Weight: LOW-MEDIUM** (one Google spokesperson, tactical guidance).
- **The finding:** Mueller advises AGAINST maintaining a separate markdown version of a site for AI agents — "you are just building technical debt." Fix accessibility/structure in the primary HTML once; "a properly made website works well for AI agents, and search engines, and LLMs, and above all, for actual people."
- **The signal (why keep it, light):** counters the emerging "make an AI-only version" tactic. Corroborates Alloro's done-right posture — AEO gains come from genuinely well-structured content that serves humans, not a gaming layer. A talking point against snake-oil AEO tactics; not load-bearing.

## AEO / GEO MECHANICS, how a page actually gets cited (from the Notion migration 2026-07-08)
> The tactical layer under the timing bet. Weight: MED. Sources: Notion "Demand Engine Spec" + "Site SEO/AEO/CRO Direction" (2026-06-26 grounded). Correlations are directional; the render-gate is a hard technical prerequisite.
- **Brand-search volume predicts AI citations MORE strongly than backlinks** (~0.334 correlation). Founder-led brand-building IS the AEO play, not a separate track.
- **Original statistics in content = ~+22% citation lift.** So an "evidence pipeline" (anonymized aggregate stats from audits/platform data: "of N specialist GBP profiles analyzed, X% had...") is a compounding, non-commodity moat no horizontal player can copy. HARD-GATED: never publish a number a validator hasn't traced to source.
- **AI citations pull mostly from the FIRST THIRD of a page**, lead every section with the answer in 2-4 sentences.
- **Write H2s as the questions owners actually type**, engines fan a query into sub-questions and cite the passage answering each.
- **Self-contained answer blocks** (no opening "it/they") so a passage reads correctly when lifted out of context.
- **Comparison tables** (old-playbook vs. Alloro) get lifted near-verbatim, cited heavily.
- **A named, credentialed AUTHOR** correlates with a large lift in AI-answer appearances (most competitor pages ship anonymous).
- **Visible + actually-refreshed publish/updated dates** (recent pages cited materially more; citations decay).
- **AEO structural rubric:** answer in the first 30%, at least 1 original statistic, chunkable headings, freshness signal.
- **⛔ HARD REACH+RENDER GATE before any AEO work:** confirm crawlers (GPTBot, ClaudeBot, PerplexityBot, OAI-SearchBot, Google-Extended, Bingbot) are allowed at robots.txt/CDN, AND the page renders body text in the HTML, not an empty React root. A Vite SPA's client-render is the likely ceiling, fix this first or the rest is moot.
- **Caveat:** founder-content conversion multiples are from horizontal B2B SaaS, unproven for dental specialists; LinkedIn-primary is an unvalidated channel assumption.
