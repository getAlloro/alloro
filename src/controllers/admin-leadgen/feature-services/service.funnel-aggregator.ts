/**
 * Funnel aggregation service for the admin leadgen page.
 *
 * **Cumulative counts (T1):** each bucket counts sessions whose *max
 * reached stage ordinal* is ≥ the bucket ordinal — not sessions whose
 * `final_stage` literally equals the bucket. A session that reached
 * `results_viewed` therefore contributes to every earlier bucket too,
 * which is what a funnel should actually show.
 *
 * Max stage is derived from `leadgen_events` in one grouped query so we never
 * run one query per session. Sessions with zero events are excluded, and
 * audit-less report events collapse to landing rather than inflating report
 * engagement.
 *
 * The `abandoned` row is terminal and orthogonal — it counts sessions
 * where `abandoned=true AND completed=false`, i.e. sessions that
 * abandoned before reaching `results_viewed`. It does not participate
 * in the drop-off calculation.
 *
 * **Stage timing (T8a):** a second single-query pass computes the
 * average milliseconds between the first event at stage N and the
 * first event at stage N+1, across sessions that hit both. Exposed as
 * `avg_ms_to_reach` on each bucket (null for the first stage).
 *
 * `stage_viewed_3` (Photos sub-stage) is no longer emitted — legacy
 * enum value kept for back-compat on existing rows, but we don't waste
 * compute returning a dead bucket in the funnel response.
 */

import {
  FinalStage,
  LeadgenSessionModel,
  STAGE_ORDER,
} from "../../../models/LeadgenSessionModel";

export interface FunnelStageRow {
  name: FinalStage;
  count: number;
  drop_off_pct: number | null;
  ordinal: number;
  avg_ms_to_reach: number | null;
}

/**
 * Stages that participate in the funnel progression, in render order.
 * `stage_viewed_3` is intentionally excluded (legacy Photos sub-stage,
 * no longer emitted). `abandoned` is appended after the progression
 * loop as a terminal counter.
 */
const FUNNEL_STAGES: FinalStage[] = [
  "landed",
  "input_started",
  "input_submitted",
  "audit_started",
  "stage_viewed_1",
  "stage_viewed_2",
  "stage_viewed_4",
  "stage_viewed_5",
  "email_gate_shown",
  "email_submitted",
  "results_viewed",
  "report_engaged_1min",
  "account_created",
];

function groupFirstEventTimings(
  rows: Array<{ session_id: string; event_name: FinalStage; first_at: Date }>
): Map<string, Map<FinalStage, number>> {
  const firstByStage = new Map<string, Map<FinalStage, number>>();
  for (const row of rows) {
    const timestamp = new Date(row.first_at).getTime();
    if (!Number.isFinite(timestamp)) continue;
    const perSession = firstByStage.get(row.session_id) ?? new Map();
    firstByStage.set(row.session_id, perSession);
    if (STAGE_ORDER[row.event_name] !== undefined) {
      perSession.set(row.event_name, timestamp);
    }
  }
  return firstByStage;
}

/**
 * Returns one row per funnel stage (cumulative count + drop-off + avg
 * time-to-reach) plus a terminal `abandoned` row. Rows are sorted by
 * ordinal so the UI axis is stable.
 */
export async function aggregateFunnel(filters: {
  from?: string;
  to?: string;
}): Promise<FunnelStageRow[]> {
  // --------------------------------------------------------------------
  // Count query: one row per session with its max reached ordinal.
  // Sessions with no events are excluded. SQL and integrity filtering live in
  // LeadgenSessionModel.findSessionMaxOrdinalRows.
  // --------------------------------------------------------------------
  const sessionRows = await LeadgenSessionModel.findSessionMaxOrdinalRows(
    filters.from,
    filters.to
  );

  // Count sessions hitting each stage ordinal cumulatively, plus the
  // terminal abandoned bucket.
  const cumulativeByOrdinal = new Map<number, number>();
  let abandonedCount = 0;

  for (const row of sessionRows) {
    const maxOrd =
      typeof row.max_ordinal === "string"
        ? parseInt(row.max_ordinal, 10)
        : Number(row.max_ordinal ?? 0);

    for (const stage of FUNNEL_STAGES) {
      const ord = STAGE_ORDER[stage];
      if (maxOrd >= ord) {
        cumulativeByOrdinal.set(ord, (cumulativeByOrdinal.get(ord) ?? 0) + 1);
      }
    }

    // Terminal: abandoned before completing (reaching results_viewed).
    if (row.abandoned && !row.completed) {
      abandonedCount += 1;
    }
  }

  // --------------------------------------------------------------------
  // Timing query (T8a): for each event, compute time since the previous
  // event (chronologically) in the same session. We aggregate per
  // (session_id, event_name) first event only, then pair adjacent
  // FUNNEL_STAGES and average the deltas in JS.
  //
  // Single query: pull (session_id, event_name, first_created_at) for
  // every (session, event_name) pair — no N+1. SQL lives in
  // LeadgenSessionModel.findFirstEventTimings.
  // --------------------------------------------------------------------
  const firstEventRows = await LeadgenSessionModel.findFirstEventTimings(
    filters.from,
    filters.to
  );

  const firstByStage = groupFirstEventTimings(firstEventRows);

  // --------------------------------------------------------------------
  // Build the output rows.
  // --------------------------------------------------------------------
  const progression: FunnelStageRow[] = [];
  let prevCount: number | null = null;
  let prevStage: FinalStage | null = null;

  for (const name of FUNNEL_STAGES) {
    const ordinal = STAGE_ORDER[name];
    const count = cumulativeByOrdinal.get(ordinal) ?? 0;

    // Drop-off vs. previous funnel stage.
    let drop_off_pct: number | null;
    if (prevCount === null) {
      drop_off_pct = 0;
    } else if (prevCount === 0) {
      drop_off_pct = null;
    } else {
      drop_off_pct = ((prevCount - count) / prevCount) * 100;
    }

    // Avg ms from previous stage -> this stage (null for first stage).
    let avg_ms_to_reach: number | null = null;
    if (prevStage !== null) {
      let sum = 0;
      let n = 0;
      for (const perSession of firstByStage.values()) {
        const tPrev = perSession.get(prevStage);
        const tCur = perSession.get(name);
        if (tPrev !== undefined && tCur !== undefined && tCur >= tPrev) {
          sum += tCur - tPrev;
          n += 1;
        }
      }
      avg_ms_to_reach = n > 0 ? Math.round(sum / n) : null;
    }

    progression.push({ name, count, drop_off_pct, ordinal, avg_ms_to_reach });
    prevCount = count;
    prevStage = name;
  }

  // Terminal abandoned row — no drop-off %, no timing.
  progression.push({
    name: "abandoned",
    count: abandonedCount,
    drop_off_pct: null,
    ordinal: STAGE_ORDER.abandoned,
    avg_ms_to_reach: null,
  });

  return progression;
}
