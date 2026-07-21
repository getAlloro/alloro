# Get Found — the roadmap to moving impressions

**Plain-language build map. No jargon. If a line needs code to understand, it's wrong — fix the line.**
**Current build-state per capability lives in `docs/capability-ledger.md`; this file is the forward plan and points at those rows (GF#, CH#, GC#).**

## The goal
One real customer's **impressions go measurably up by end of month**, because of Alloro — then it repeats.

- **Get Found is about being COMPETITIVE, not complete.** Filling in name, address, phone (NAP) is the **floor** — it stops Google penalizing you. It does not move you *above* a rival. The levers that climb are **relevance** (category, content) and **prominence** (reviews, activity).
- **Impressions** = how often you showed up on Google (Maps + Search; the "Google Visibility" number).

## Proof customers — pick sites with room to CLIMB, not a winner
A dominant, already-complete practice can't demonstrate competitive lift. So:
- **org 8 (Artful Orthodontics)** — a contested market to climb.
- **org 39 / Woodbridge location** — One Endo ranks **#11 of 11 (last)** here for "endodontist" (verified; the client dashboard hides it — ledger row H1). A genuinely contested site *inside* an otherwise-winning account.
- **Garrison / South Orange** — brand-new location, climbing from zero.
- **org 39 overall is the wrong proof site** — it's #1 in four of five locations and fully complete; hygiene levers can't show lift there.

## Four lanes, four clocks
| Lane | Moves | Clock |
|---|---|---|
| **1. Local pack** (GBP: category, reviews, activity) | Impressions | **Now** — current batch (cash items) |
| **2. Reviews / prominence** | Impressions (prominence) | **With Lane 1** — strongest form is Sikka-gated |
| **3. CTR** (page titles on hosted sites) | CTR | **Next**, after cash items |
| **4. Organic + AEO** (GSC→content, FAQ/schema) | Impressions | **After CTR** |
| _Backlinks beyond citations_ | _authority_ | **Deferred on purpose** |

Every Turn: **the lever · what fires it · which number · how Dave checks it moved without reading code.**

---

## LANE 1 — Local pack, the COMPETITIVE levers · clock: NOW
Winning the map-pack against rivals. Moves **impressions**. (NAP fill is the floor beneath this, not a headline — ledger GF6.)

### Turn 1 — Right Google category *(relevance; strongest single lever)* — ledger **GF2**
- **Lever:** most specific correct category ("Endodontist," not "Dentist").
- **What fires it:** Alloro looks it up (Decision-1 truth table), drafts, owner approves, publish.
- **Number:** impressions.
- **Dave checks:** profile's main category reads the specific one; impressions climb over 1–3 weeks.
- **State: BUILT–NOT-WIRED** (recommender #193 has no caller). Build = wire into approve-and-publish (A6).

### Turn 2 — Activity / freshness (posts, photos) *(prominence signal)*
- **Lever:** regular GBP posts + photos — Google favors active profiles.
- **What fires it:** Alloro drafts a post/photo cadence, owner approves, publish.
- **Number:** impressions.
- **Dave checks:** the profile shows recent posts/photos; impressions trend up.
- **State: PARTLY BUILT** — local-post generation exists (default-off, ledger GF5-family); confirm cadence + wire.

### Turn 3 — NAP / completeness *(the FLOOR — label it as such)* — ledger **GF3/GF4/GF6**
- **Lever:** fill missing hours/phone; keep name/address/phone consistent.
- **Number:** impressions (parity only — stops penalties; does NOT out-compete).
- **State:** website-URL fills today (≈no-op); **phone/hours are FROM-SCRATCH** (no value source). Do not sell this as the win — it's table-stakes.

---

## LANE 2 — Reviews / prominence · clock: WITH Lane 1 (strongest form Sikka-gated)
The biggest competitive local lever: more, fresher reviews than the rival. Moves **impressions via prominence**.

### Turn 1 — Review replies *(engagement signal)* — ledger **CH1**
- **Lever:** reply to existing reviews (owner-approved).
- **What fires it:** Alloro drafts replies, owner approves, publish. **State: LIVE.**
- **Number:** prominence/engagement → impressions.
- **Dave checks:** recent reviews show owner-approved replies.

### Turn 2 — Review *requests* / velocity *(the real mover)* — ledger **CH2**
- **Lever:** ask more patients for reviews so volume/velocity beats the rival.
- **What fires it:** patient contact via **Sikka** → owner-approved request → send.
- **Number:** review count/velocity → prominence → impressions.
- **Dave checks:** new-review rate rises vs. the tracked rival.
- **State: GREENFIELD, Sikka-gated.** Review *replies* built; review *requests* not. Sandbox is free to start now; paid rollout triggers on the cash plan (Pawlak save / Garrison signature). See `[[project_sikka_integration]]`.

---

## LANE 3 — CTR (page titles on Alloro-hosted sites) · clock: NEXT — ledger **GC1**
Same impressions, more clicks: a sharper title/description earns the click. Moves **CTR**.

### Turn 1 — Amend page title + meta description
- **Lever:** rewrite the Google-result title/description on pages we host to match real searches.
- **What fires it:** Alloro drafts, owner approves, publish.
- **Number:** CTR (clicks ÷ impressions).
- **Dave checks:** the search-result snippet reads the new copy; CTR rises.
- **State: MACHINERY EXISTS** (`website_builder.pages.meta_title/description`), draft-flow FROM-SCRATCH. **Verify first:** which clients are Alloro-hosted (editable) = the `/admin/websites` roster.

---

## LANE 4 — Organic + AEO · clock: AFTER CTR
### Turn 1 — Revive the GSC→content loop — ledger **GF7**
- **Lever:** publish pages answering the practice's real Google demand.
- **Number:** impressions (organic).
- **Dave checks:** new pages for real search terms exist; impressions for more queries climb.
- **State: SHIPPED — verify it still runs** ("A1's shipped GSC→content loop"; confirm the schedule, don't rebuild).

### Turn 2 — FAQ / schema per playbook v4 — ledger **GF8**
- **Lever:** add FAQ + JSON-LD blocks to hosted pages so AI answers pick them up.
- **Number:** AI-answer visibility.
- **Dave checks:** page carries FAQ + schema; `hasFaqSchema` flips true.
- **State: PARTLY BUILT** (audit detects; JSON-LD insert+verify exists). Build = apply systematically.

---

## Deliberately deferred — backlinks beyond citations
Out of scope on purpose: slow, partly outside our control, doesn't fit the draft→approve→publish loop. Revisit only after the four lanes prove they move numbers.

---

## The honest bottom line for Dave
- **Get Found = out-compete, not complete.** Category + reviews + activity climb; NAP is the floor.
- **Prove on sites with room to climb** (org 8, org 39/Woodbridge, Garrison South Orange) — never a winner.
- **Build-state per lever is in the ledger, checked against code** — not asserted here.
- **One customer, one change at a time, owner approves each** — no blanket auto-publish.
- **Done =** a proof site's impressions measurably higher than its written-down baseline, and we can name the Alloro change that moved them.

_Written 2026-07-21 from verified dev/dave (66f1bf7af). Build-state calls live in `docs/capability-ledger.md`._
