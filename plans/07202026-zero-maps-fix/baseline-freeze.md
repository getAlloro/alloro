# Baseline freeze — the "before" half of the proof receipt

**Status: NOT YET RUN.** This file is the instruction and the place the snapshot lands. It is committed alongside the trailing-window fix because the freeze depends on that fix being live, and writing the rule down now is the only way to stop it being run at the wrong moment.

## ⛔ The timing rule — the whole thing turns on this

Run the freeze **after** the zero-Maps fix is deployed **and** the first daily run since deploy has completed, and **before** the GF5 write-back flag is switched on for any of these orgs.

| When you froze | What the "before" number is | Worth |
|---|---|---|
| Before the fix deploys | the fabricated `0` | **Worthless — actively misleading.** Any later number looks like infinite improvement. |
| After the fix, before GF5 | the real pre-lever impressions | The receipt |
| After GF5 is on | a number the lever already moved | No baseline at all |

Freezing early is worse than not freezing. A "before" of `0` would let us claim a lift that is really just the instrument starting to work — exactly the fabricated-proof failure this codebase keeps designing against.

**Precondition to check first (one read, not an assumption):** confirm the daily run has actually stored a non-zero, dated Maps figure for at least one of these orgs since the deploy. If impressions still read `0` everywhere, the fix has not taken effect and freezing now captures the same false zero. `agent_results.date_start/date_end` and the stored row's per-side `data_date` should show the resolved published day, not calendar yesterday.

## What to capture

Three orgs, the three proof sites:

| Org | id |
|---|---|
| Garrison | 5 |
| Artful | 8 |
| Woodbridge / One Endodontics | 39 |

Three numbers each, at the whole-practice level, for a stated window:

| Metric | Source | Funnel gate |
|---|---|---|
| Impressions | `readImpressions` (`src/controllers/patient-journey/feature-services/stageReaders.ts:372`) — GSC organic + GBP Maps | Get Found |
| CTR | the GSC totals summary carried through the same reader path (`stageReaders.ts:442`) | Get Found → Get Considered |
| Leads | `readLeads` (`stageReaders.ts:509`) | Get Chosen |

## How to record it

A dated snapshot in this folder: `baseline-YYYY-MM-DD.json`, one object per org.

```json
{
  "capturedAt": "YYYY-MM-DDTHH:MM:SSZ",
  "capturedBy": "who ran it",
  "windowStart": "YYYY-MM-DD",
  "windowEnd": "YYYY-MM-DD",
  "precondition": {
    "zeroMapsFixDeployedAt": "YYYY-MM-DD",
    "firstDailyRunAfterDeploy": "YYYY-MM-DD",
    "gf5EnabledForAnyOrg": false,
    "impressionsReadNonZero": true
  },
  "orgs": [
    {
      "orgId": 5,
      "name": "Garrison",
      "impressions": null,
      "ctr": null,
      "leads": null,
      "notes": "state anything unavailable rather than writing 0"
    }
  ]
}
```

**Write `null`, never `0`, for anything you could not read.** That is the same distinction the fix itself enforces: a missing measurement is not a measured zero. A baseline with a fabricated `0` in it produces a fabricated lift later.

## Who runs it

A DB + GSC read — the operator or a computer-use agent with access. Not this session: it has no production data access, and a baseline derived from anything other than the real stored rows is not a baseline.

## What it feeds

The "after" half is the attributed-lift engine (`ctrAttributionMath.ts`, PR #209) once its thresholds are calibrated. Note its wiring constraints before pointing it at any of this: it measures CTR only, and it must never be fed org-wide impressions to score a single-location change.
