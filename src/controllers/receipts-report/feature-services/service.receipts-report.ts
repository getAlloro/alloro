/**
 * Receipts Report Service
 *
 * Read-only, deterministic builder for the `ReceiptsReport`. Given an
 * organization and a period, it returns the true monthly value
 * delivered, split into an org-level block and per-location rows, with
 * an honest data-integrity flag on every field.
 *
 * NO writes, NO mutations, NO route registration. All numbers trace to
 * a real source. If a value cannot be sourced, the field carries a flag
 * saying so - we never estimate or fabricate. A real zero is a value,
 * not a flag.
 *
 * Grain (why some fields are org-level, verified against the dev DB):
 *  - websiteVisitors: Rybbit tracks one site per org (org-level).
 *  - leadsCaptured: website_builder.form_submissions link to a project
 *    via project_id; projects carry organization_id and NO location, and
 *    form_submissions.location_id is null for every row. So leads are
 *    org-level; querying form_submissions.location_id would fabricate a
 *    zero for every org. We join project_id -> projects.organization_id.
 *  - ranking + reviewsVsTopCompetitor: every weekly_ranking_snapshot is
 *    stored org-level (location_id null across all orgs today). We report
 *    them once at org level, never copied onto each location.
 *  - gbpPostsPublished + gbpReviewRepliesPublished: genuinely per-location.
 */

import { db } from "../../../database/connection";
import { fetchRybbitMonthlyComparison } from "../../../utils/rybbit/service.rybbit-data";
import logger from "../../../lib/logger";
import {
  LocationReceipts,
  OrgLevelReceipts,
  RankingMovementField,
  RankingMovementItem,
  ReceiptField,
  ReceiptsReport,
  ReceiptsReportSchema,
  ReplacementCostContext,
  ReviewsVsTopCompetitorField,
  TotalReceipts,
} from "../types";

const LOG_PREFIX = "[receipts-report]";
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// =====================================================================
// MAIN ENTRY
// =====================================================================

/**
 * Build the read-only receipts report for one organization + period.
 *
 * @param organizationId Organization ID
 * @param startDate      Inclusive period start, ISO date `YYYY-MM-DD`
 * @param endDate        Inclusive period end, ISO date `YYYY-MM-DD`
 */
export async function getReceiptsReport(
  organizationId: number,
  startDate: string,
  endDate: string
): Promise<ReceiptsReport> {
  // End-exclusive bound so a full end day is included for timestamp
  // columns (create_time, reply_date, submitted_at).
  const endExclusive = addDays(endDate, 1);

  // 1) Locations for the org (id + display name).
  const locationRows: Array<{ id: number; name: string | null }> = await db(
    "locations"
  )
    .where({ organization_id: organizationId })
    .select("id", "name")
    .orderBy("id", "asc");

  const locationIds = locationRows.map((l) => l.id);

  // 2) Fetch every source once.
  const [visitors, leads, snapshots, gbpPosts, reviewReplies] =
    await Promise.all([
      fetchWebsiteVisitors(organizationId, startDate, endDate),
      fetchLeadsCaptured(organizationId, startDate, endExclusive),
      fetchSnapshotRows(organizationId, startDate, endDate),
      fetchGbpPostsByLocation(organizationId, startDate, endExclusive),
      fetchReviewRepliesByLocation(locationIds, startDate, endExclusive),
    ]);

  // 3) Org-level block (values not attributable per location).
  const orgLevel: OrgLevelReceipts = {
    websiteVisitors: visitors,
    leadsCaptured: leads,
    rankingMovement: buildRankingMovement(snapshots, endDate),
    reviewsVsTopCompetitor: buildReviewsVsTopCompetitor(snapshots, endDate),
  };

  // 4) Per-location rows (genuinely per-location fields only).
  const locations: LocationReceipts[] = locationRows.map((loc) => ({
    locationId: loc.id,
    locationName: loc.name ?? `Location ${loc.id}`,
    gbpPostsPublished: gbpPosts.available
      ? { value: gbpPosts.byLocation.get(loc.id) ?? 0, flag: "ok" }
      : { value: null, flag: "source_unavailable" },
    gbpReviewRepliesPublished: reviewReplies.available
      ? { value: reviewReplies.byLocation.get(loc.id) ?? 0, flag: "ok" }
      : { value: null, flag: "source_unavailable" },
  }));

  // 5) Totals for the summable per-location fields.
  const total: TotalReceipts = {
    gbpPostsPublished: sumField(locations, (l) => l.gbpPostsPublished),
    gbpReviewRepliesPublished: sumField(
      locations,
      (l) => l.gbpReviewRepliesPublished
    ),
  };

  const report: ReceiptsReport = {
    organizationId,
    period: { startDate, endDate },
    generatedAt: new Date().toISOString(),
    orgLevel,
    locations,
    total,
    replacementCostContext: buildReplacementCostContext(),
  };

  // Validate the final shape. A failure here is a programming error in
  // this file, not a data problem, so we let it throw.
  return ReceiptsReportSchema.parse(report) as ReceiptsReport;
}

// =====================================================================
// SOURCE FETCHERS
// =====================================================================

/**
 * Website visitors from Rybbit (org/site level). Rybbit has one site per
 * org, so this number is not attributable per location.
 */
async function fetchWebsiteVisitors(
  organizationId: number,
  startDate: string,
  endDate: string
): Promise<ReceiptField> {
  try {
    // Immediately-preceding window of equal length for context. We do
    // not use the comparison in the report, but the service requires it.
    const spanDays = daysBetween(startDate, endDate);
    const previousEnd = addDays(startDate, -1);
    const previousStart = addDays(previousEnd, -spanDays);

    const comparison = await fetchRybbitMonthlyComparison(
      organizationId,
      startDate,
      endDate,
      previousStart,
      previousEnd
    );

    // Honest null: org has no rybbit_site_id (integration not wired) OR
    // the config lookup could not resolve a site. Either way there is no
    // attributable visitor number, so we do not emit one.
    if (!comparison) {
      return { value: null, flag: "not_connected" };
    }

    return { value: comparison.currentMonth.sessions, flag: "ok" };
  } catch (err: any) {
    logger.warn(
      `${LOG_PREFIX} website visitors failed for org ${organizationId}: ${
        err?.message || err
      }`
    );
    return { value: null, flag: "source_unavailable" };
  }
}

/**
 * Leads captured (org-level) from website_builder.form_submissions.
 *
 * form_submissions.location_id is null for every row, and projects carry
 * no location, so leads cannot be attributed per location. We join
 * form_submissions.project_id -> projects.organization_id and count
 * submissions whose submitted_at is within the period. A real 0 is an
 * honest value, not a flag.
 */
async function fetchLeadsCaptured(
  organizationId: number,
  startDate: string,
  endExclusive: string
): Promise<ReceiptField> {
  try {
    const row = await db("website_builder.form_submissions as f")
      .join("website_builder.projects as p", "f.project_id", "p.id")
      .where("p.organization_id", organizationId)
      .andWhere("f.submitted_at", ">=", startDate)
      .andWhere("f.submitted_at", "<", endExclusive)
      .count({ count: "*" })
      .first();

    return { value: Number(row?.count ?? 0), flag: "ok" };
  } catch (err: any) {
    logger.warn(
      `${LOG_PREFIX} leads query failed for org ${organizationId}: ${
        err?.message || err
      }`
    );
    return { value: null, flag: "source_unavailable" };
  }
}

/**
 * GBP posts published per location from public.gbp_local_posts.
 *
 * Defensive by design: this table is not migrated on the dev clone, so
 * the query throws `relation "gbp_local_posts" does not exist`. On any
 * query error we mark the field source_unavailable (value null) rather
 * than fabricate a count.
 */
async function fetchGbpPostsByLocation(
  organizationId: number,
  startDate: string,
  endExclusive: string
): Promise<{ available: boolean; byLocation: Map<number, number> }> {
  try {
    const rows: Array<{ location_id: number; count: string }> = await db(
      "gbp_local_posts"
    )
      .where({ organization_id: organizationId })
      .whereNull("deleted_at")
      .andWhere("create_time", ">=", startDate)
      .andWhere("create_time", "<", endExclusive)
      .groupBy("location_id")
      .select("location_id")
      .count({ count: "*" });

    return { available: true, byLocation: toCountMap(rows) };
  } catch (err: any) {
    logger.warn(
      `${LOG_PREFIX} gbp_local_posts unavailable for org ${organizationId}: ${
        err?.message || err
      }`
    );
    return { available: false, byLocation: new Map() };
  }
}

/**
 * GBP review replies published per location from website_builder.reviews:
 * rows where has_reply = true and reply_date is within the period.
 */
async function fetchReviewRepliesByLocation(
  locationIds: number[],
  startDate: string,
  endExclusive: string
): Promise<{ available: boolean; byLocation: Map<number, number> }> {
  if (locationIds.length === 0)
    return { available: true, byLocation: new Map() };
  try {
    const rows: Array<{ location_id: number; count: string }> = await db(
      "website_builder.reviews"
    )
      .whereIn("location_id", locationIds)
      .andWhere("has_reply", true)
      .andWhere("reply_date", ">=", startDate)
      .andWhere("reply_date", "<", endExclusive)
      .groupBy("location_id")
      .select("location_id")
      .count({ count: "*" });

    return { available: true, byLocation: toCountMap(rows) };
  } catch (err: any) {
    logger.warn(
      `${LOG_PREFIX} review replies query failed: ${err?.message || err}`
    );
    return { available: false, byLocation: new Map() };
  }
}

interface SnapshotRow {
  location_id: number | null;
  week_start: Date | string;
  position: number | null;
  keyword: string | null;
  competitor_name: string | null;
  competitor_review_count: number | null;
  client_review_count: number | null;
}

/**
 * All weekly_ranking_snapshots rows for the org whose week_start falls
 * within the period. Every row is org-level (location_id null) with
 * today's data. `available` is false only when the query itself fails.
 */
async function fetchSnapshotRows(
  organizationId: number,
  startDate: string,
  endDate: string
): Promise<{ available: boolean; rows: SnapshotRow[] }> {
  try {
    const rows: SnapshotRow[] = await db("weekly_ranking_snapshots")
      .where({ org_id: organizationId })
      .andWhere("week_start", ">=", startDate)
      .andWhere("week_start", "<=", endDate)
      .select(
        "location_id",
        "week_start",
        "position",
        "keyword",
        "competitor_name",
        "competitor_review_count",
        "client_review_count"
      )
      .orderBy("week_start", "asc");

    return { available: true, rows };
  } catch (err: any) {
    logger.warn(
      `${LOG_PREFIX} weekly_ranking_snapshots query failed for org ${organizationId}: ${
        err?.message || err
      }`
    );
    return { available: false, rows: [] };
  }
}

// =====================================================================
// BUILDERS
// =====================================================================

/**
 * Coverage note when the latest snapshot week predates the period end,
 * so a stale figure is never presented as the period-end state without a
 * caveat. Returns "" when coverage reaches the period end.
 */
function coverageNote(latestWeek: string, periodEnd: string): string {
  return latestWeek < periodEnd ? `snapshots end ${latestWeek}` : "";
}

/**
 * Ranking movement per keyword (org-level): earliest vs latest in-period
 * position, PLUS best and worst position seen at any point, so a
 * mid-period dip is never hidden behind matching endpoints.
 */
function buildRankingMovement(
  snapshots: { available: boolean; rows: SnapshotRow[] },
  periodEnd: string
): RankingMovementField {
  if (!snapshots.available)
    return { movements: [], note: "", flag: "source_unavailable" };
  if (snapshots.rows.length === 0)
    return { movements: [], note: "", flag: "no_snapshots" };

  const rows = snapshots.rows; // week_start-ascending
  const byKeyword = new Map<string, SnapshotRow[]>();
  for (const row of rows) {
    const key = row.keyword ?? "(unspecified)";
    const list = byKeyword.get(key) ?? [];
    list.push(row);
    byKeyword.set(key, list);
  }

  const movements: RankingMovementItem[] = [];
  for (const [keyword, list] of byKeyword) {
    const earliest = list[0];
    const latest = list[list.length - 1];
    const positions = list
      .map((r) => r.position)
      .filter((p): p is number => p !== null);

    movements.push({
      keyword,
      startPosition: earliest.position,
      endPosition: latest.position,
      // best = lowest rank number, worst = highest rank number.
      bestPosition: positions.length ? Math.min(...positions) : null,
      worstPosition: positions.length ? Math.max(...positions) : null,
    });
  }

  const latestWeek = toIsoDate(rows[rows.length - 1].week_start);
  return { movements, note: coverageNote(latestWeek, periodEnd), flag: "ok" };
}

/**
 * Reviews vs top competitor (org-level), from the LATEST in-period
 * snapshot row, with the same coverage note as ranking so a stale count
 * is flagged rather than presented as current.
 */
function buildReviewsVsTopCompetitor(
  snapshots: { available: boolean; rows: SnapshotRow[] },
  periodEnd: string
): ReviewsVsTopCompetitorField {
  if (!snapshots.available)
    return { value: null, note: "", flag: "source_unavailable" };
  if (snapshots.rows.length === 0)
    return { value: null, note: "", flag: "no_snapshots" };

  const rows = snapshots.rows; // week_start-ascending
  const latest = rows[rows.length - 1];
  const latestWeek = toIsoDate(latest.week_start);

  return {
    value: {
      clientReviewCount: latest.client_review_count,
      competitorName: latest.competitor_name,
      competitorReviewCount: latest.competitor_review_count,
    },
    note: coverageNote(latestWeek, periodEnd),
    flag: "ok",
  };
}

/**
 * Replacement-cost context. Deliberately emitted with NO dollar figures:
 * the line-item labels are drafted by AI, but every rate and the total
 * stay null and `ratesStaked` stays false until a human stakes real
 * rates. This keeps the report honest (no unstaked or unattributable
 * dollar figure ships) and canon-safe (never implies guaranteed revenue).
 */
function buildReplacementCostContext(): ReplacementCostContext {
  return {
    lineItems: [
      { service: "SEO", monthlyRate: null },
      { service: "review management", monthlyRate: null },
      { service: "GBP management", monthlyRate: null },
      { service: "website/content", monthlyRate: null },
    ],
    total: null,
    note: "Replacement-cost rates pending owner/canon confirmation - not yet staked; no dollar figure emitted.",
    ratesStaked: false,
  };
}

// =====================================================================
// HELPERS
// =====================================================================

/**
 * Sum one numeric field across locations, honestly. Only "ok" locations
 * contribute. If every location is ok, flag "ok". If none are ok, carry
 * the shared non-ok flag. If it is a mix, flag "partial_sum" and return
 * the partial value.
 */
function sumField(
  locations: LocationReceipts[],
  pick: (l: LocationReceipts) => ReceiptField
): ReceiptField {
  if (locations.length === 0) return { value: 0, flag: "ok" };

  const fields = locations.map(pick);
  const okFields = fields.filter((f) => f.flag === "ok");

  if (okFields.length === fields.length) {
    const sum = okFields.reduce((acc, f) => acc + (f.value ?? 0), 0);
    return { value: sum, flag: "ok" };
  }

  if (okFields.length === 0) {
    // All locations share a non-ok state; carry that flag through.
    return { value: null, flag: fields[0].flag };
  }

  // Mixed: report the partial sum but flag it as partial.
  const partial = okFields.reduce((acc, f) => acc + (f.value ?? 0), 0);
  return { value: partial, flag: "partial_sum" };
}

/** Turn grouped count rows into a location -> count map. */
function toCountMap(
  rows: Array<{ location_id: number; count: string | number }>
): Map<number, number> {
  const map = new Map<number, number>();
  for (const row of rows) {
    map.set(row.location_id, Number(row.count));
  }
  return map;
}

/** Add (or subtract) whole days to an ISO date string, returning YYYY-MM-DD. */
function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Whole days between two ISO date strings (endDate - startDate). */
function daysBetween(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00.000Z`).getTime();
  const end = new Date(`${endDate}T00:00:00.000Z`).getTime();
  return Math.round((end - start) / MS_PER_DAY);
}

/** Normalize a date/timestamp value to a YYYY-MM-DD string. */
function toIsoDate(value: Date | string): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}
