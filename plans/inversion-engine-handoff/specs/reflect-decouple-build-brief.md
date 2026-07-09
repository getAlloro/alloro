# Build brief: Reflect decouple — reach the 2/3 who don't import

*For Dave. Grounded in the 2026-07-08 Reflect audit (file:line verified on the working tree; re-confirm vs `origin/dev/dave`). Fastest, highest-coverage, fully-in-repo value win: flips ~2/3 of paying customers from getting NOTHING out of Reflect to getting monthly insight, with no new integration and no customer ask.*

## Why (the value)
The monthly Reflect pipeline (Referral Engine -> dashboard_metrics -> Summary -> Opportunity -> CRO) reaches **0 of the ~2/3 of customers who don't do a PMS import.** It is triggered ONLY when a PMS import finalizes. So most paying customers get no monthly pattern-recognition at all. This unblocks it for them.

## The two changes

**1. Trigger the monthly pipeline on a SCHEDULE for all onboarded locations.**
- Today: fired only by `pms-finalize.service.ts:110` (`POST /api/agents/monthly-agents-run`). The scheduler (`agentRegistry.ts:18-33`) runs only `proofline` + `ranking`, NOT the monthly pipeline. The only other caller (`/process-all`) is DEPRECATED.
- Change: add a scheduled monthly job that runs the monthly pipeline for every active/onboarded location, independent of PMS import.

**2. Make the Referral Engine a SKIPPABLE enrichment, not a hard gate.**
- Today: Referral Engine runs FIRST + unconditionally (`service.monthly-agent-processor.ts:245-307`); on no/failed PMS data it returns `{success:false}` at `:301`, aborting before Summary/Opportunity/CRO ("no source = no ship").
- Change: guard it, `if (pmsDataForRE present) run RE; else skip`, and let Summary/Opportunity/CRO run STANDALONE on the PMS-INDEPENDENT signals (GBP, reviews, website, ranking) that non-importers already have. RE becomes enrichment when PMS exists, not a prerequisite.

## ⚠️ Grounded corrections (read of the actual `service.monthly-agent-processor.ts`, 2026-07-08)
- **Simpler than the audit stated:** Opportunity + CRO are already DISABLED (`if (false)`, `:424-438`); Summary v2 absorbs them. So this is just: skip RE + let Summary v2 run standalone. No 3-agent chain to protect.
- **⭐ LANDMINE, a THIRD guard is required:** `createTasksFromReferralEngineOutput(referralEngineOutput!, ...)` at `:447` is called UNCONDITIONALLY with a non-null assertion. When RE is skipped, `referralEngineOutput` is undefined and this **CRASHES the run.** MUST guard it: `if (referralEngineOutput) { await createTasksFromReferralEngineOutput(...) }`. (dashboard metrics `:322` and the Summary payload `:366` already tolerate null RE; only `:447` doesn't.)
- So the pipeline change is THREE guards: (a) wrap the RE loop `:254-307` in `if (pmsDataForRE) {...}`; (b) soften the `:301` abort to log-and-continue (RE never blocks Summary); (c) guard `:447`.
- **OPEN RISK (verify before "done"):** Summary v2 takes the non-PMS signals and structurally tolerates null RE, but whether it produces GOOD insight standalone (not thin filler) needs ONE real run on a non-importing org. Do NOT call this done until a non-importer's run produces useful `agent_type='summary'` rows.

## Done when
- A never-imported org, on the schedule, gets a monthly Summary/Opportunity/CRO run. **VERIFY:** `agent_results` has `agent_type='summary'` rows for a non-importing org (the audit's decisive check).
- Importers unchanged (RE still runs first + enriches when PMS data exists).

## Guardrails (honesty)
- Do NOT fabricate referral data for non-importers, RE simply skips; the honest state is "no referral data yet," never invented.
- Standalone Summary/Opportunity/CRO must be honest on the non-PMS signals only (no claiming referral insight without referral data).

## Scope note
This is the fast, in-repo unlock. The durable follow-ons (a live PMS connector to remove the manual import entirely; expanding the value signal beyond referrals) are separate, slower builds, NOT this brief.
