<!--
  If someone moves things into your house you can see the new couch and the TV.
  You cannot see the water filter they put under the sink, or the cat-6 they ran in the walls.
  The couch cannot hurt you. The water filter can — quietly, for years, because nobody knew it
  was installed and nobody thought to check it.

  Receipt (2026-07-16): a function shipped to production that tells a practice owner
  "your practice is healthy this month" while the practice ranks 10th. It passed every gate we
  have — clean, tested, Constitution-compliant, changelogged. The CTO saw it live, pointed at it
  as good work, and did not know it was ours or that it lied. It was a water filter.

  Fill this in for a reader who did NOT write the code and will not read the diff.
-->

## What is it
<!-- One sentence, plain. No jargon. A reader who has never seen this code should get it first try. -->

## What does it do
<!-- What changes in the world? If it makes a CLAIM to an owner ("healthy", "you rank #3", "we
     posted"), say the claim in the exact words they will read, and say what makes it true. -->

## Where does it live
<!-- The files/modules a person opens to find it. Not the plan folder — the CODE.
     "I don't know where to look at" is the actual failure this line exists to stop. -->

## Where is it seen
<!-- The screen, route, email, or API a human encounters it on. If a human never sees it, say
     "not owner-facing" — that is an answer, not a blank. -->

## Who does it impact
<!-- Which role, and how their day changes. Note any role that LOSES an ability (e.g. viewers can
     no longer approve) — a silent permission change is a water filter. -->

## Is it ON?
<!-- Canon: every lever ships OFF. State the flag by name and its default, or "no flag — live on merge".
     "What is shipped but off?" must be answerable without grepping the tree. -->

## What is NOT proven
<!-- Required. Anything you could not run — no live DB, no provider key, no runtime walk — belongs
     here, not in a green tick. `pending` is honest; `pass` you did not observe is a false claim,
     and a false claim in a PR body is the most-repeated finding in this repo's review history. -->

---

<!--
  Checks, kept short on purpose — a checklist nobody reads is worse than none:
  - Every claim above is true at THIS head, not at the head you started from. Bodies go stale in hours.
  - Exit codes read directly from each command. `npm run check:all` chains with `;`, so its exit code
    only reflects the LAST command — it is not a receipt.
  - If you claim tests prove a fix: revert the fix, watch them fail, restore. A test that has only ever
    been green may pass with or without your change, and you would not know.
  - This repo is PUBLIC. Describe the defense, never the attack. No exploit strings outside test files.
-->
