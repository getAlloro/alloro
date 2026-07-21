# Get Found — the roadmap to moving impressions

**Plain-language build map. No jargon. If a line needs code to understand, it's wrong — fix the line.**

## The goal
One real customer's **impressions go measurably up by the end of the month**, because of Alloro.

- **Impressions** = how often the practice showed up on Google (the "Google Visibility" number on Patient Journey Insights). It's Maps + Search added together.
- **The customer we prove it on:** One Endodontics (org 39). We picked them because that team actually engages, so per-item owner approval works — Alloro proposes a change, the owner clicks approve, we publish.
- **How we'll know it worked:** write down today's impressions number for org 39. Watch it over the next 1–3 weeks. If it's higher and we can point to the Alloro change that did it, done. (Fair warning — Google is slow; a change today may take days to show. That's normal, not a bug.)

## How each Turn is written
Every Turn says four things in plain words:
1. **The lever** — the change we make to the Google profile.
2. **What fires it** — how the change gets made and approved.
3. **The number it moves** — impressions, always, on this roadmap.
4. **How Dave checks it moved** — something Dave can see on the screen or the profile, **without reading any code.**

---

## Turn 0 — Make the number readable first
- **Lever:** none yet — this is the pre-check. The impressions number is stuck at zero, so we can't measure anything until it's real.
- **What fires it:** Dave runs the zero-Maps check on dev (the read-only query), or the nightly job logs it. Then, if it's the date-window cause, build the offset fix. *(This one is Dave's, not a build task for the AI.)*
- **Number:** the impressions gauge itself.
- **Dave checks:** open org 39's Patient Journey Insights. "Google Visibility" shows a real number, not 0, and it changes from one day to the next.
- **Status: BLOCKED — everything below waits on this. Nothing can be verified while the number reads zero.**

## Turn 1 — Set the right Google category *(the strongest lever)*
- **Lever:** make the profile's main category the most specific correct one — e.g. "Endodontist," not "Dentist." Specific category = Google shows the practice for the right searches = more impressions.
- **What fires it:** Alloro looks up the right category from the specialty list (the Decision-1 truth table), drafts the change, the owner approves it, we publish to Google.
- **Number:** impressions.
- **Dave checks:** on the profile / Local Rankings, the main category reads the specific one. Over 1–3 weeks, impressions trend up.
- **Status: BUILD — the category recommender exists (#193) but is NOT connected to anything.** The build is wiring it into the approve-and-publish path (A6). It is not a from-scratch feature, but it is real work — today it recommends into a void.

## Turn 2 — Fill in business hours and phone
- **Lever:** add missing hours and phone number to the profile. A complete profile ranks and shows more than an incomplete one.
- **What fires it:** Alloro pulls the hours/phone from what we already store, drafts the change, owner approves, we publish.
- **Number:** impressions.
- **Dave checks:** the profile shows hours and a phone number where it was blank before. Impressions trend up over the following weeks.
- **Status: BUILD FROM SCRATCH — today there is no source for these.** The current fill code only handles the website URL; for phone and hours it hits a dead end marked "no value source." So this Turn is two jobs: find where the real hours/phone live, then wire them through the approve-and-publish path. Do not scope it as "wiring an existing lever" — the lever doesn't exist yet.

## Already live, but don't count it — website URL
The one thing the engine does automatically today is add a missing website URL to the profile. **Treat this as a no-op:** almost every profile already has a website, so it changes nothing and moves no number. It's mentioned only so nobody points at it as progress.

---

## The honest bottom line for Dave
- **Turn 0 unblocks measurement. Turn 1 is the real first mover** (category, built-but-unwired). **Turn 2 is more work than it looks** (phone/hours are from-scratch).
- We prove it on **one customer (org 39), one change at a time, owner approving each.** No blanket auto-publish — the owner clicks approve on every change, because these levers are unproven and we're touching a real Google profile.
- **Done for this roadmap =** org 39's impressions are measurably higher than today's written-down number, and we can name the Alloro change that moved them.

_Written 2026-07-21 from the verified state of dev/dave. The build-from-scratch / built-but-unwired calls are checked against the code, not assumed._
