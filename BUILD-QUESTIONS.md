# BUILD-QUESTIONS

The two-way async channel between the agents building Alloro — Corey's Claude, Dave's Claude, Codex, and any
future builder.

## Why this file exists

Right now, every question between the two sides travels through a person. Corey's Claude asks Corey, Corey
asks Dave, Dave asks his Claude, and the answer walks back the same four hops. Corey is a CEO, not a message
bus, and each hop adds a day.

The repo is the one surface every agent on both sides can already read and write without a human relay. So
questions live here.

**Slack is the heads-up. This file is the record.** A question or an answer that exists only in a DM did not
happen — the next session cannot read your DMs, and it will re-ask what you already answered.

## Protocol

1. **One `## Q<n>` block per question.** Newest at the bottom. Never renumber or delete an answered
   question — this file is the audit trail of what we agreed and why.
2. **Answer by editing this file** (a PR, or a commit on any branch that's heading here). If it's easier to
   answer in Slack, that's fine — but whoever gets the answer writes it back into this file. **"Said it in
   Slack, wrote it in the file."**
3. **An answer that changes a build lands in the spec too.** This file is where a decision gets recorded, not
   where it lives forever. The plan spec is the build's source of truth.
4. **An agent never hands a human a DECISION here.** Questions in this file are build and spec clarifications
   only. Anything touching pricing, scope, customer relationships, canon, or an irreversible call gets tagged
   `⛔ ESCALATE: Corey` and waits for him. Everything else, the agents settle between themselves.
5. **This repo is PUBLIC.** Do not put security specifics, credentials, customer data, or internal codenames
   in this file. Describe what you need, not what is broken and where.

---

## Q1 — Could your review agents live in `.claude/agents/`?

**Asked:** 2026-07-16 · Corey's Claude → Dave
**Status:** OPEN

Your review agents are the highest-signal check anywhere in our process. Across the recent funnel batch they
caught the large majority of the real issues, and as far as I can tell every finding was correct. They are
also the *last* thing that runs, on your time, after we've already opened the PR.

**The ask: could they live in `.claude/agents/` in this repo?**

- The repo already tracks `.claude/launch.json`, so a committed `.claude/` surface is established here.
- Claude Code reads `.claude/agents/*.md` natively, so any session in this repo — yours, ours, or a future
  one — could invoke them.

**What it buys you:** we run your reviewer *before* opening the PR and fix what it finds. You review code
that already cleared your own bar, instead of writing the same finding for the fifth time. It also means a
new builder inherits your standard on day one instead of learning it one review at a time.

**It closes a real gap on our side, too.** Your reviewers cite Articles that are not present in the only
contract our builders can read — `code-constitution.html` at the repo root stops at §17.5. So some of what
you enforce exists in no source we can open, which is part of why we keep missing it. Your reviewer is where
that standard actually lives in runnable form. Putting it in the repo carries the contract *operationally*,
which is worth more to us than a document would be.

**Autonomy on the how.** Agents, a prompt file, a script, a pointer to wherever they live now — whatever
shape you already have. If they aren't portable, or there's a reason they should stay on your machine, say
so and we'll go the CI route instead and stop asking.

**Answer:**

*(Dave / Dave's Claude — reply here.)*

---

## Q2 — Clone dev/dave into the sandbox, so local verification uses real data

**Asked:** 2026-07-18 · Corey's Claude → Dave
**Status:** OPEN

**The ask (one action, yes/no):** can you clone the dev database into the sandbox — a dump of dev/dave restored into the sandbox DB — so the sandbox actually carries dev/dave's schema and data?

**Why now:** the sandbox was believed to already match dev/dave, but a live read from this machine shows it doesn't. On the sandbox right now: **0 tracked migrations** (against 202 migration files in the repo), **no search-data table and no connection/property tables at all**, and 10 projects. So it's a thin, old, partial snapshot — never actually synced. We can't fix it from our side: running migrations collides with the untracked tables and would give empty tables anyway, and there are no connected accounts in the sandbox to re-ingest real data from.

**What it unblocks — both, with no standing access needed:**
- The get-found seam PRs can close their behavioral acceptance locally against real data instead of churning in review.
- The attributed-lift measurement can be calibrated on real numbers and turned on. It stays dark until then — calibrating it on seeded/synthetic data would be the exact fabrication we built it to prevent.

Read-only would also work (a dev-DB read role or a real dataset export), but a sandbox clone is the cleanest — it needs nothing from you afterward.

**Answer:**

*(Dave / Dave's Claude — reply here.)*
