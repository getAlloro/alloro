# Honesty Scan — a standing pass for your Claude (code-grounded)

**What it is.** A repeatable check your Claude runs on any customer-facing or LLM-facing surface *before it ships*, for one class: **a number or claim that reaches a customer or the audit LLM without real, measured backing.** It enforces one rule: **tag every number measured / derived / placeholder**, and the grounding check must **REJECT a proxy-field citation, not certify it**. Alloro sells "we deal in what's real" — this keeps that true, surface by surface.

**Why it's worth a standing pass.** This class has surfaced repeatedly, and each time it reached a customer: demo data on paying dashboards, `score_gap = 100−score` labeled "gap to #1," competitor review-velocity pinned to `0`, the audit recommending capabilities Alloro hasn't built, the hardcoded "synced" Referral chart, an unweighted multi-location rating shown as the practice's real stars. A human catches these only when someone happens to look; running this on every change is the fix.

## The method — provenance FIRST, then signatures
Pattern-matching alone misses the worst case: a real, correctly-labeled, correctly-precise number read from the **wrong column** looks perfect and is still a lie (the CRO engine reading `org_id`/`properties` where `organization_id`/`event_data` were meant is the textbook one). So:

1. **Enumerate every surface the value reaches** — not just the dashboard: the audit PDF / deliverable, email / SMS, the GBP / social posts Alloro publishes on the customer's behalf, the LLM payload **and** its customer-rendered output, exported reports, the marketing site. Name what you scanned and what you did not.
2. **Trace the top number(s) end-to-end** — render / agent-cite → query → source column/table → what it actually holds (unit, freshness, sample size, source system). This is the step a grep can't do.
3. **`git fetch origin dev/dave` first**, then **run the signatures** below (grep + read) against `origin/dev/dave` (`git show` / `git grep`; not local `main` or `sandbox` — they diverge, and an un-fetched snapshot silently gives wrong-vintage results — the exact staleness this scan warns about).
4. **Grade** 🟥 reaches a paying customer (rendered / emailed / published) — *and an LLM input that has any customer-facing output is also 🟥* / 🟨 LLM-only or plausible / 🟩 clean; each with a file:line.
5. **Fix = one of three:** correct to the real measurement, label it honestly (derived / estimated / stale / as-of / "out of what"), or remove the claim. **Never leave a confident wrong number.**

## The 9 signatures
1. **Fabricated / placeholder reaching a live customer** — demo/seed branches renderable by a paying org (gated only by a wizard flag, no subscription check); hardcoded constants emitted as fact; a benchmark value pinned (e.g. `0`) then compared as if measured. *Verify the gate — a `demo` branch that IS subscription-gated is clean.*
2. **Proxy shown as a real measurement** — `100 − score` as "gap"; a formula-rank as "local-pack position"; a stand-in under the real thing's name.
3. **Claim of an unbuilt capability.** Copy / audit-output recommending something Alloro hasn't built. **The built set (as of 2026-07-05, verified on dev/dave):** ✅ GBP posts + scheduling · review replies / auto-response · Alloro-built websites + on-page SEO · lead/contact forms · photo-attach-to-a-post. ⛔ **NOT built:** review-generation (soliciting reviews) · PMS live-integrations/connectors (manual import exists; connectors don't) · booking flow · GBP profile photo-refresh · GBP completeness write-back (hours/category to Google). *Rule of thumb: every GBP **write** in the tree is review-replies + local-posts only; anything claiming a third is unbuilt. Add to this set the same PR a capability ships.*
4. **Label decoupled from data** — a wall-clock month over stale data; "production" over a gross column; a score with no denominator/definition.
5. **Wrong-source / provenance** — a right-looking number from the wrong column, unit, or table (gross vs net, cents vs dollars, wrong `event_type`, wrong join). Caught only by the end-to-end trace (method step 2).
6. **Silent staleness / dead pipeline** — a real measurement past its freshness window, or a fetch that fail-degrades to `0`/`null`, under a present-tense label ("current," "this month") with no as-of.
7. **Small-sample / coverage lie** — a trend / average / "top" / rate over an n too small to hold its shape ("#1 of 2" as a market rank; a trend over 2 points; "42.7%" from 7 events).
8. **Stitched / attributed** — two real numbers from two systems joined into a claim neither measures (all-channel visits ÷ search impressions framed as a click-through; correlation rendered as causation).
9. **Invented composite / false precision** — a blended index ("Practice Health 87," "AI Visibility Score") whose weights are arbitrary or undisclosed, shown at measurement-grade precision. Is the formula real and disclosed, and is the precision earned?

## When to fire it
- Before any change to a customer-facing render / email / audit-deliverable / publish / LLM-output path.
- Once across the existing high-risk surfaces (they predate the check): the dashboard-metrics builders, the audit pillars, the LLM payloads.
- The durable end-state is wiring it into CI + the render/send path so it fires **automatically**, not on memory. Detection can be a checklist; reliable firing can't. **After the 2nd finding of the same signature, that class graduates to the automated gate — mandatory, not optional.**

## Output
Ranked findings (reaches-a-paying-customer first), each: signature · file:line · reach · the honest fix. Then always: **what's verified vs. assumed**, and **which surfaces you did NOT scan** (the pass is only as good as its coverage).
