# PR Pipeline Protocol v1.1

**Status:** Proposed 2026-07-20. Becomes law when Corey and Dave both confirm.
Rules below are active for agent compliance via CLAUDE.md.
**Applies to:** Every PR into dev/dave, from any agent or human.
**Why it exists:** Two consecutive batches arrived 70 to 90 percent not merge-ready. Root cause, named identically by both review sides: nothing checks work before handoff, and findings travel out-of-band. This protocol installs the missing feedback signal. Four rules, one page.

---

## Rule 1: The gate blocks. It does not advise.

**What:** `PR Checks` becomes a required status on dev/dave via branch protection. A red check means the PR cannot merge. No exceptions, no advisory mode.

**How:**
1. Dave flips branch protection on dev/dave, requiring `PR Checks` (settings change, ~10 min).
2. Before relying on it, open a throwaway PR with a deliberate type error and confirm the gate goes red. The gate has never been observed failing; an untested gate is a decoration.
3. Any check that cannot be verified in CI (machine-local files, laptop paths) either moves into the repo or is removed from the gate. No `UNVERIFIABLE` plus exit 0. A check that apologizes is not a check.

**Achieves:** Work gets judged by a machine at PR time, not by Dave days later. The eight-of-ten PRs that merged with no mechanical check can never happen again.

---

## Rule 2: Findings live on the PR. Never in Slack.

**What:** Every defect, must-fix, and change request lands as a PR review comment on the PR it concerns. Slack is for coordination and decisions, never for defect lists.

**How:**
1. Dave (or his Claude) posts findings as GitHub review comments with Request Changes.
2. Corey's CC responds on the same thread: fix commit hash, or a stated reason it disagrees.
3. A PR is re-reviewable only when every open comment is resolved or explicitly deferred by Dave.

**Achieves:** Ends the guessing game (the #183 "confirm your exact four" loop). The fix cycle closes on the artifact itself, and the history survives for the next agent that touches the file.

---

## Rule 3: Acceptance before code. Claims get tested before they are asserted.

**What:** No build starts without a written acceptance spec. No PR leaves draft until that spec passes locally.

**How:**
1. Before CC writes code, the plan file includes an **acceptance block**: numbered behavioral items (the T1..Tn format from the July 20, 2026 review suite, PRs 183-187) plus, for anything with a data or output claim, the **predicted signal**: what the output must look like if the change works, stated before it runs.
2. Format ownership: Dave's side owns the acceptance spec format and can reject a spec as insufficient. CC owns passing it. CC never grades its own homework format.
3. The PR body may only claim what an acceptance item proved. "Read-only," "no writes," "sanitizes" are claims; each needs a passing item behind it. Unproven claims stay out of the body.
4. **Data-first corollary:** before scheduling any validation window, confirm the underlying data exists (one read-only query, like the zero-Maps check). A correct fix on empty data proves nothing and burns an afternoon.

**Achieves:** Kills the overclaim class at the source ("read-only" PRs that write, "sanitizing" commits that reject). This is the same defect BUG-04 was: no predicted signal, so a wrong output looked fine for six weeks.

The PR body follows the repo template (.github/PULL_REQUEST_TEMPLATE.md). A PR the reviewer cannot situate in plain language — what it is, where it's seen, who it touches — is not reviewable and is returned, not reviewed.

---

## Rule 4: One batch in flight. Serial, not parallel.

**What:** Maximum 10 PRs per batch. No new batch spawns until the current batch is merged AND validated on dev.

**How:**
1. Batch is open → CC's only jobs are fixing review comments and running dev validation. No new feature branches.
2. Batch closes when: all PRs merged or explicitly closed, dev deploy green, and CC's post-merge validation posted to the PR log.
3. PR-LOG.md regenerates at batch close (scripts/pr-log.sh on dev/dave) so the ledger always reflects the finished state.

**Achieves:** The constraint is Dave's review-fix cycle (his stated cadence: 1 to 2 days per batch), not build speed. Adding build throughput to a review-constrained system grows the rejection pile, not the product. Serial batches convert raw speed into merged, validated features, which is the only unit that counts toward the end-of-month Done-for-You target.

---

## Roles in one line each

- **Corey / CC:** writes acceptance spec, builds, passes gate, answers review comments on-thread, validates on dev after merge.
- **Dave / Dave's Claude:** owns the gate, owns acceptance format, reviews as PR comments, merges, deploys.
- **Jo:** untouched by this doc; customer-facing board stays hers per the Weekly Reset split.

## Adoption checklist

- [ ] Dave: branch protection on, `PR Checks` required
- [ ] Either side: throwaway red PR proves the gate fails
- [ ] Unverifiable checks moved into repo or dropped from gate
- [ ] Both sides confirm Rule 2 (findings as PR comments) in Slack, once, then never discuss defects in Slack again
- [ ] CC operating instructions updated: acceptance block required in every plan file; PR body claims must map to passing items
- [ ] Current open batch finishes under old rules; next batch starts under this protocol
