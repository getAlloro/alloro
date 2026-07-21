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
- **org 39 / Woodbridge location** — a **brand-new location climbing from zero**. #11 of 11 is the *expected* starting state, not a scandal — an honest "from-zero" chart that goes up. It's the running precedent for the Garrison South Orange play below (same story). The client dashboard omits it (ledger H1) — that's the instrument defect, not a comment on Woodbridge's rank.
- **Garrison / South Orange** — brand-new location, climbing from zero (the same play Woodbridge is already running).
- **org 39 overall is the wrong proof site** — it's #1 in four of five locations and fully complete; hygiene levers can't show lift there.

### Saif vs Dominion — RESOLVED to hypothesis B (2026-07-21, Dave's prod query)
The rival Saif (One Endo) cares about is **Dominion Endodontics**. Dave's prod query returned: **Dominion is NOT in Woodbridge's tracked competitor set — not in the top 20.** One Endo Woodbridge sits #4 of 20 (prod), 0 reviews (brand-new listing).
- **A — map fight: FALSE.** The defining rival is invisible to the local-pack instrument — see ledger H3.
- **B — referral-share fight: the live read.** The contest is over which referring dentists send patients where — **Reflect's / the Referrals Hub's domain, fed by the Sikka DentalEMR bridge** — not the local pack. *B is now the working hypothesis; confirm it in the referral data, don't yet assert it.*

**Rule (still in force):** no Saif-facing narrative asserts Dominion's map rank — because it has none in our instrument. (The earlier "Dominion sits in Woodbridge's set" inference is **withdrawn and now disproven** — Deming: don't state what isn't measured.)

## Five lanes, five clocks
| Lane | Moves | Clock |
|---|---|---|
| **1. Local pack** (GBP: category, reviews, activity) | Impressions | **Now** — current batch (cash items) |
| **2. Reviews / prominence** | Impressions (prominence) | **With Lane 1** — strongest form is Sikka-gated |
| **3. CTR** (page titles on hosted sites) | CTR | **Next**, after cash items |
| **4. Organic + AEO** (GSC→content, FAQ/schema, AI-bot access) | Impressions / AI answers | **After CTR** |
| **5. AI-source presence** (off-Google citations) | AI recommendations | **Build-ahead** — cheap, uncontested; deferred from the July-31 impressions win |
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
### Turn 0 — Let the AI bots in (robots.txt) *(gates everything AI on hosted sites)*
- **Lever:** on each hosted client site, allow the AI answer-crawlers in `robots.txt`: **OAI-SearchBot, GPTBot, PerplexityBot, ClaudeBot**.
- **What fires it:** a ~5-minute per-site check + edit — we host the sites.
- **Number:** AI-answer visibility (a silent block zeroes it regardless of everything else).
- **Dave checks:** each hosted site's `robots.txt` does not disallow those agents.
- **State: FROM-SCRATCH audit** — most agencies never run it; cheap and load-bearing.

### Turn 1 — Revive the GSC→content loop — ledger **GF7**
- **Lever:** publish pages answering the practice's real Google demand.
- **Number:** impressions (organic).
- **Dave checks:** new pages for real search terms exist; impressions for more queries climb.
- **State: SHIPPED — verify it still runs** ("A1's shipped GSC→content loop"; confirm the schedule, don't rebuild).

### Turn 2 — FAQ / schema + citation-worthiness per playbook v4 — ledger **GF8**
- **Lever:** add FAQ + JSON-LD blocks **and make pages citation-worthy** — natural-language URL slugs (an ~8-point citation swing in Ahrefs' 1.4M-prompt study), quotable specific facts over marketing prose, schema.
- **Why both:** *retrieval is not citation.* AI fetches many pages and cites few — schema gets you read; extractable specifics get you *quoted*.
- **Number:** AI-answer visibility (citations, not just retrieval).
- **Dave checks:** page carries FAQ + schema (`hasFaqSchema` true) and has clean slugs + quotable facts.
- **State: PARTLY BUILT** (audit detects; JSON-LD insert+verify exists). Build = apply systematically + add the citation-worthiness items.

---

## LANE 5 — AI-source presence (off-Google citations) · clock: BUILD-AHEAD
**The big gap this map missed: AI recommendations run on a different data stack than Google, and Lanes 1–4 only feed Google's.** ChatGPT's local answers draw on Bing / Bing Places, Foursquare (~70% of ChatGPT local results in one study), Apple Maps, Yelp, and third-party mentions — **not** your Google Business Profile. So off-Google citations aren't hygiene here; they're **load-bearing** for AI answers.

### Turn 1 — Claim + NAP-lock the off-Google sources
- **Lever:** claim and NAP-lock **Bing Places, Apple Business Connect, Yelp, Foursquare**, and the healthcare directories (Healthgrades-class) per client.
- **What fires it:** hours of one-time done-for-you setup per account — the drudgery no doctor will do themselves.
- **Number:** AI recommendations (a *different* surface than impressions).
- **Dave checks:** each source lists the client, claimed and NAP-consistent.
- **State: FROM-SCRATCH.**

**Why build-ahead, not now:** only ~**1.2%** of local businesses get AI-recommended (ChatGPT) vs **35.9%** in Google's 3-pack, with only ~**45% overlap** between the two — a distinct, uncontested surface. Cheap and mostly one-time. It does **not** serve the July-31 impressions win (see calibration); it's the early-GBP-adopter play for the next surface.

---

## Deliberately deferred — backlinks beyond citations
Out of scope on purpose: slow, partly outside our control, doesn't fit the draft→approve→publish loop. Revisit only after the four lanes prove they move numbers.

---

## Measurement / verify — the AI surface (as ruled)
- **Per-location AI-answer accuracy audit:** does ChatGPT / Perplexity state the practice's facts correctly, and does it *recommend* (not just cite) it? Track wrong-fact detection + the citations-vs-recommendations distinction.
- **AI-referral capture:** CallRail AI-source data + confirm **#156 records AI referrers**, so AI-driven visits/calls are visible when they arrive.
- **LSA / PMax flag:** a one-line client flag if anyone runs Local Services Ads, re the **Aug 2026 PMax migration**.

## Honesty calibration — build the presence now, promise nothing yet
The SEO-industry "AI is ~45% of local discovery" numbers are **vendor-inflated.** The hardest datum in the pile is CallRail's: **AI-driven calls are ~0.115% of inbound today**, growing 58% in eight months. Posture is neither panic nor dismissal: **make the cheap structural moves now while uncontested** (how early GBP adopters won the last decade), **instrument the measurement**, and **never promise a client AI traffic today.** That's our register — small verified claims. *(Calendar: SEJ AI Visibility Masterclass webinar is July 30 — worth the hour for whoever owns the verify column.)*

## The honest bottom line for Dave
- **Get Found = out-compete, not complete.** Category + reviews + activity climb; NAP is the floor.
- **Prove on sites with room to climb** (org 8, org 39/Woodbridge, Garrison South Orange) — never a winner.
- **Build-state per lever is in the ledger, checked against code** — not asserted here.
- **One customer, one change at a time, owner approves each** — no blanket auto-publish.
- **Done =** a proof site's impressions measurably higher than its written-down baseline, and we can name the Alloro change that moved them.

_Written 2026-07-21 from verified dev/dave (66f1bf7af). Build-state calls live in `docs/capability-ledger.md`._
