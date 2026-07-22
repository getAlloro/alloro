# The Plan — Get Found, in Plain Words

*One short page so Corey, Dave, and both our Claudes work from the same thing. Written fresh 2026‑07‑21 (the old version was stale). The long, detailed version is `funnel-feature-sequence.md`; the real‑time build state is `docs/capability-ledger.md`.*

**What this is:** the get‑found part of Alloro's job — helping a customer's practice get found by the people searching for them. In canon terms it's **Driver 2 (presence)**, and it powers the Master Recipe's **"Activate"** step: make the customers we already have *feel* Alloro working. That is canon's #1 priority — you don't pour new sales into a leaking bucket.

---

## Where the build is right now — for Dave (updated 2026-07-22)

**Authoritative PR state = `PR-LOG.md` (regenerate: `bash scripts/pr-log.sh`).** This session added four PRs off `dev/dave`, all **reachable** (each wires a caller / edits running code — not dead code):

| PR | What it does | Verified |
|---|---|---|
| **#202** | Wire the GBP category value‑source — owner‑approved primary‑category proposal (strongest get‑found lever; was built‑not‑wired) | tsc 0 · conv 0 · 23/23 |
| **#203** | Dashboard calm state shows "what Alloro did for you" (consumes the live proof‑receipt endpoint #177) | tsc 0 · fe‑tsc clean · §17 clean |
| **#204** | Confirmation receipt to form submitters + rate‑limit the form endpoint via Alloro Protect | tsc 0 · conv 0 · 43/43 |
| **#205** | CTR‑opportunity diagnosis — brick 1 of the CTR self‑optimization loop (on the deployed GSC pipeline) | tsc 0 · conv 0 · 6/6 |
| **#206** | CTR educated‑hypothesis rewrite — brick 2 (framework‑grounded, self‑proving: baseline‑only prediction the model can't inflate, deterministic principle selection, GSC‑query injection‑hardened; fills Dave's batch of 10) | tsc 0 · conv 0 · 24/24 · **overwatch‑verified** (adversary + 2 checkpoints) |

**Suggested merge order:** #199 → #202 → #203 → #204 → #205. All additive, off `dev/dave`; the code PRs don't depend on #199 (that's the docs stack). Each PR body carries full context + verification.

**Strategic reprioritization (Owner.com reframe, verified by a Fable adversary against the code):** fast results come from **converting existing demand (CTR + CRO)**, not new impressions (weeks, Google‑bound). **GSC Search data works today** — only the Maps term is broken (zero‑Maps, Dave's), so a GSC‑measured lever is provable now. New lead lever = the **CTR/meta rewrite off GSC demand** (un‑gated, fast, measurable now); #205 is its brick 1. The category lever (#202) is the strongest single found lever but its metric (Maps impressions) reads zero until zero‑Maps lands, so it compounds underneath rather than headlining.

**CTR self‑optimization loop (staged):** brick 1 diagnose ✅ (#205) → brick 2 educated hypothesis ✅ (#206) → brick 3 recorded experiment (before/after CTR — a table/migration; needs #205+#206 merged+wired first) → brick 4 fleet learning (learned expected‑CTR replaces the static baseline — the data moat).

**Still Dave's / externally gated:** merge the queue; root‑cause zero‑Maps (Maps = 0 across 9 months); enable the write‑back flag per practice for the category run. Renderer access unlocks the site‑serve/CRO levers; Sika unlocks review velocity + reactivation.

---

## The finish line (what "done" means)

There are two halves, and they move at different speeds:

1. **A number actually moves** — impressions, then website traffic, then form submissions.
2. **The owner sees Alloro working** — they open the app (or the email) and feel that someone is on it.

**The honest version (this matters):** "done" is **Alloro provably doing the right work on the levers, and honestly reporting the result** — not a promise that every number goes up. A real CMO improves the odds and does the work; no honest CMO guarantees every figure rises every month (Google takes time; competitors and seasons move). We say *"designed to increase your visibility,"* never *"you will get more patients."*

**The one test for any task:** does it move one of the three numbers, **or** make the owner see Alloro working? If neither — we don't do it.

---

## Track A — make a number actually move (slower: weeks)

1. **Fix the impressions number that reads zero.** *(Dave's.)* It's stuck at zero for everyone — the data's there, it's not summed right. Nothing else in Track A can be proven until this number is real. This is the one blocker, and it lives here in the plan, not off to the side.
2. **Wire the category lever.** Today the only thing Alloro auto‑does is fill in a website URL — and every Google profile already has one, so it changes nothing. The business *category* is the strongest lever; it's built but not connected. Connect it so Alloro proposes a better category and, once the owner approves, sets it.
3. **Turn it on for a dental proof site (an ortho or endo practice already in the category catalog)** — both already covered by the category catalog. Guardrails make this safe to run straight on a real customer: the owner approves each change, the master switch stays off until enabled per practice, and the prior value is captured for rollback. *(Retired the old "test on our own account first": Alloro isn't a dental business, so the dental category lever can't propose for it — and the guardrails mean we don't need it as a buffer.)*

**Category verticals — decision (Corey, 2026-07-21):** the category engine is vertical‑agnostic; dental is seeded now (Dentist → Orthodontist/Endodontist/…). Other ICP verticals (veterinary, optometry, chiropractic, physician) get seeded **as a customer in that vertical lands**, not up front — each needs resolver family‑scoping (the loop isn't vertical‑scoped today, `gbpCategoryTaxonomy.ts:219‑229`) + verified Google category IDs. Dental is the proven template that makes each next vertical cheap.

## Track B — make the owner see Alloro working (faster: days)

4. **Replace the confusing "all caught up / not connected" with "here's what Alloro did for you this week."** Right now the app reads broken when it should read reassuring.
5. **Add the "thanks, we got your request" confirmation email.** The form works, but the person who fills it out hears nothing back. Small, fast, and it's felt value.

*Track B is the fast half. It can put a visible win across the line in days while Track A's Google number takes weeks — which is what keeps a customer paying while the slow number climbs.*

---

## The rules we can't break (from canon)

- **No promises.** "Designed to," "working to" — never "will." (Value #6)
- **Never show a number until it's true for that customer.** A wrong number to a skeptic loses them faster than no number.
- **Every "what Alloro did" has to be specific and true** — a real report, never a generic "get more reviews" card. The test: *does it make the owner feel understood before informed?*
- **The owner stays the hero.** Alloro does the work and shows it; the owner approves each outward change.

---

## The next machine (named, not now): Sika

The PMS/EMR bridge. It ends the manual report pulls, fixes the inaccurate numbers, and unlocks the two things we can't do today: **review requests** (the fastest‑acting lever) and **referral‑conversion tracking** (did the referral actually *start*). Gated on the sales call + the practice connecting + cash. Dave can pilot it on a proof-of-concept practice. This is a separate machine — it does not belong inside the get‑found steps above.

---

## What we don't know yet (honest — no pretending it's clean)

- **Why Maps reads zero** across 9 months — Dave's to root‑cause; it could reveal the number is harder to fix than a quick sum.
- **Whether "wire the category lever" is actually small** — that's an inference; we confirm it with a code trace *when we build it*, not before.
- **The full "what Alloro did" report is more than a wording fix** — the owner‑facing report is largely unbuilt. The confirmation email is the small piece.
- **Proving a number moved *because of* Alloro** needs attribution we haven't built yet — at first it's directional ("we did X, it rose"), not causally proven.

---

## Where this fits

Get‑found is the **first gate**. A competent CMO works all three (found → considered → chosen) as a portfolio. This plan is the **first slice** — and the first proof that the loop (diagnose → do the owner‑approved work → measure → report honestly) actually works on a real account. Not the finished CMO. The first honest step toward it.
