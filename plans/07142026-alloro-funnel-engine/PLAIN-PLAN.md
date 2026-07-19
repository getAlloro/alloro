# The Plan, in Plain Words

*A simple map of what we are building and how. Written 2026-07-15 so Corey and Claude both point at the same thing. The full, detailed version is `funnel-feature-sequence.md` in this same folder.*

## Why we are doing this
Alloro helps a small local business (like a dentist's office) get noticed online. When someone nearby needs that kind of help, we want the business to show up, look like people they can trust, and be easy to reach.

The owner started their business to have a good life — not to fight with Google all day. We do the online part for them, so they get their time back.

**The one thing we count:** more of the right people "raise their hand." They fill out the form on the website and say "I want to come in." That is our finish line. We do **not** book the visit or answer the phone for them. That part is the owner's job.

## The three steps (a customer's trip)
1. **Get found** — people can find the business at all. On Google, on maps, and in AI answers.
2. **Get considered** — people look and think "yes, I trust these folks." This all happens on the website.
3. **Get chosen** — people reach out. They fill out the form. That is the win.

**Not our job:** social media, paid ads, or texting old customers to come back. Those belong to someone else.

## How we build (the big rule)
One piece at a time. In order. We finish one piece and prove it is real before we start the next. No jumping ahead. We never say "done" without proof you can click.

Think of a restaurant:
- First we lock **the menu** — the list of what we are making.
- Then we write **each recipe** — a plan for one piece, based on real research on how it works and who proved it.
- Then we cook **each dish in the test kitchen** (the sandbox) — in Dave's style, so it looks familiar to him.
- Then we **taste it** — we test it, and we try hard to break it.
- Then **Dave plates it** — he checks it and adds it to the real system.

Each step is something we can fall back to. If we stop partway, we still have the menu, the recipes, and the dishes we already finished.

## What "done" means (so you can always check)
A piece is done only when:
- There is a **plan file** you can open.
- It is **built and tested** — the tests still pass (485 of them, all green).
- A **"try to break it" check** passed.
- There is a **link** (a Pull Request) you can click and see.

**No link = not done.** Then I say "still planning," not "done."

## The order we go in
**Get found (we are close — one part is already done):**
1. Check the Google-demand tool really works.
2. Score the business's own Google listing.
3. Check if they show up in Google's AI answers.
4. Check that the name, address, and phone match everywhere.
5. Make the map-rank check better.
6. (Later, harder) Write fixes straight to Google.

**Early, alongside get-found — the counter:** put in the plumbing that tracks how many people raise their hand, and where they came from. We put this in early so nothing gets built blind.

**Get considered (the website):**
7. Turn on website tracking.
8. Rewrite the page in the business's real voice.
9. Add the real people and their credentials.
10–12. Warm up reviews, posts, and real photos.

**Get chosen (the form):**
13. Make the form solid and safe.
14. Let people say "here's a time that works for me."
15. Ask happy customers for a review — only when the owner says OK.
- (Optional, later) A "thanks, we got it" note — only if the owner approves it.

**Last:**
16. Keep the whole trip smooth, from search to page to form.
17–18. Turn on the experiments that show which version works best.

## The safety rules (always on)
- **No promises we can't keep.** We say "designed to help," never "we will get you to #1."
- **The owner is the boss.** Every tool has an on/off switch and a preview.
- **I build in the test kitchen only.** I never push straight to the real system. Dave checks and adds everything.

## The North Star (the one test every piece must pass)
When the owner sees what we made, they should say **"how did they know that?"** — and know it came from Alloro. If a piece does not clear that bar, it does not ship.

## Where we are right now
- The **menu** is written (a file).
- **Three dishes** are already cooked and waiting for Dave (three links you can click: PRs #158, #159, #160).
- The **test kitchen works** (485 tests green).
- **Next:** check the first get-found piece really works on the live dev site, then plan the next piece.
