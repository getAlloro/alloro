# State of Now Fetch Protocol

The "Alloro — State of Now" Notion page is the shared substrate every Claude (CC, CW, Cowork, Jo's Claude, Dave's Claude) reads at session start. Locked 2026-05-23 per the Five-Claude Shared Substrate proposal at `notion.so/Proposal-Five-Claude-Shared-Substrate-MVP-369fdaf120c4816f82c2c0c93aa9e202`.

## Page URL

`https://www.notion.so/Alloro-State-of-Now-369fdaf120c481c698bfdf4c0b32c556`

Notion page ID (for the MCP): `369fdaf1-20c4-81c6-98bf-df4c0b32c556`.

## Five sections

1. **Current state of Alloro** — MRR, customer count, ICP, beachhead, pricing. Owner: Corey.
2. **Active customer state** — one line per active customer. Owner: Jo. CC and CW append product-side events.
3. **Active priorities and next moves** — what's shipping, who owns, what's blocking. Owner: Corey. CC and Dave append shipped work.
4. **Doctrine refs** — NS-001, AP-8, lane discipline, no-business-hours, no-em-dashes, plain-language, no-fancy-named-principles, no-relay-postman, pricing canon, N8N retired, hardcoded ownership rule, etc. Owner: Corey locks new doctrine; CC and CW append references.
5. **Pending decisions and blockers** — one line per open item. Owner: anyone observes; only Corey or Jo clears.

## Read protocol (every session, first action)

1. Fetch the page before processing the user's message.
2. Read all five sections. Note each section's last-updated timestamp.
3. If any section's timestamp is older than its stale-canary threshold (Sections 1/2/3: 7 days; Section 4: 60 days; Section 5: decision items > 7 days get `[STALE]` prefix), surface that fact in the response.
4. Sign the Last-Read Log on the page with `[CC] YYYY-MM-DD` after reading.
5. If the page can't be fetched, name that explicitly in the response before answering anything else.

## Write protocol

- **One owner per section** (see owner labels in section headers). Anyone can append events to Sections 2 and 3.
- **Append-only for events; replace for state.** Customer engagement events get appended (timestamps preserved). Current state fields (MRR, customer count) get replaced.
- **Atomic signed updates.** Every entry timestamped and signed `[Corey] / [Jo] / [Dave] / [CC] / [CW] / [Cowork]`.
- **Re-fetch before state replacement.** If replacing a state field, re-fetch the section first to confirm no write in the last 30 seconds.

## Propagation rule (the N8N example)

When Corey locks new doctrine, he appends one line to Section 4 with timestamp and signature. Next session of any Claude reads it before they draft anything. The 2026-04-21 N8N retirement should have lived in this section so Jo's Claude wouldn't have referenced N8N in her 2026-05-22 SOP. Going forward: doctrine locks land in Section 4 immediately.

## What does NOT belong in this page

- Long-form rationale (lives in source docs; this page links to them)
- Memory files (those live in `~/.claude/projects/-Users-coreys-air-code-alloro/memory/`)
- Build specs (those live in `/tmp/` or under the artifacts container in Notion)
- Per-turn updates (this page is session-grain, not turn-grain)
- Anything that grows unbounded (each section has a line cap; old entries archive to a sibling history page)

## Related canon

- Coordination page: `notion.so/CC-Claude-Web-Coordination-Page-368fdaf120c481988d1cd147e55ac589` (CC ↔ CW operational substrate)
- CC prompt page: `notion.so/369fdaf120c481569171c745cb124a3a` (CW writes assignments here for CC)
- Artifacts container: `notion.so/May-22-Drafts-and-Strategic-Mirror-Artifacts-369fdaf120c481d68945f1913ae5342e`
- AP-8 (substrate-stale): `.claude/rules/anti-patterns.md`
