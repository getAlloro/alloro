import { OrganizationModel } from "../../../models/OrganizationModel";
import {
  ReceiptsReportModel,
  ReceiptsReportPublishedWorkRow,
  ReceiptsReportRankingObservationRow,
} from "../../../models/ReceiptsReportModel";
import {
  fetchRybbitPeriodUsers,
  RybbitPeriodUsersResult,
} from "../../../utils/rybbit/service.rybbit-data";
import {
  GetReceiptsReportInput,
  LocationReceipts,
  RankingMovementField,
  RankingMovementItem,
  RankingObservationPoint,
  ReceiptField,
  ReceiptsReport,
  ReplacementCostContext,
  ReviewsVsTopCompetitorField,
  receiptsReportSchema,
} from "../ReceiptsReportTypes";
import { ReceiptsReportError } from "../feature-utils/ReceiptsReportError";

const LOCAL_POST = "local_post";
const REVIEW_REPLY = "review_reply";

interface SearchResultReceiptEntry {
  name: string;
  position: number;
  reviewCount: number;
  isClient: boolean;
}

/** Orchestrates read-only receipts sources without performing database access. */
export class ReceiptsReportService {
  static async getReport(
    input: GetReceiptsReportInput
  ): Promise<ReceiptsReport> {
    const organization = await OrganizationModel.findById(input.organizationId);
    if (!organization) {
      throw new ReceiptsReportError(
        "RECEIPTS_REPORT_ORGANIZATION_NOT_FOUND",
        "Organization not found."
      );
    }

    const { startAt, endExclusiveAt } = reportDateRange(input);
    const [locations, leads, publishedWork, rankings, visitors] =
      await Promise.all([
        ReceiptsReportModel.listLocationsByOrganization(input.organizationId),
        ReceiptsReportModel.countFormSubmissionsForPeriod(
          input.organizationId,
          startAt,
          endExclusiveAt
        ),
        ReceiptsReportModel.countPublishedGbpWorkItemsByLocation(
          input.organizationId,
          startAt,
          endExclusiveAt
        ),
        ReceiptsReportModel.listCompletedSearchPositionObservations(
          input.organizationId,
          startAt,
          endExclusiveAt
        ),
        fetchRybbitPeriodUsers(
          input.organizationId,
          input.startDate,
          input.endDate
        ),
      ]);

    const workCounts = indexPublishedWork(publishedWork);
    const rankingsByLocation = indexRankings(rankings);
    const locationReceipts = locations.map((location) =>
      buildLocationReceipts(
        location.id,
        location.name,
        workCounts,
        rankingsByLocation.get(location.id) ?? []
      )
    );

    const report: ReceiptsReport = {
      organizationId: input.organizationId,
      period: { startDate: input.startDate, endDate: input.endDate },
      generatedAt: new Date().toISOString(),
      orgLevel: {
        websiteVisitors: websiteVisitorsField(visitors),
        leadsCaptured: availableField(leads),
      },
      locations: locationReceipts,
      total: {
        gbpPostsPublished: availableField(
          sumLocations(locationReceipts, "gbpPostsPublished")
        ),
        gbpReviewRepliesPublished: availableField(
          sumLocations(locationReceipts, "gbpReviewRepliesPublished")
        ),
      },
      replacementCostContext: replacementCostContext(),
    };

    return receiptsReportSchema.parse(report);
  }
}

function reportDateRange(input: GetReceiptsReportInput): {
  startAt: Date;
  endExclusiveAt: Date;
} {
  const startAt = new Date(`${input.startDate}T00:00:00.000Z`);
  const endExclusiveAt = new Date(`${input.endDate}T00:00:00.000Z`);
  endExclusiveAt.setUTCDate(endExclusiveAt.getUTCDate() + 1);
  return { startAt, endExclusiveAt };
}

function indexPublishedWork(
  rows: ReceiptsReportPublishedWorkRow[]
): Map<string, number> {
  return new Map(
    rows.map((row) => [
      workCountKey(row.location_id, row.content_type),
      row.count,
    ])
  );
}

function workCountKey(locationId: number, contentType: string): string {
  return `${locationId}:${contentType}`;
}

function indexRankings(
  rows: ReceiptsReportRankingObservationRow[]
): Map<number, ReceiptsReportRankingObservationRow[]> {
  const indexed = new Map<number, ReceiptsReportRankingObservationRow[]>();
  for (const row of rows) {
    const locationRows = indexed.get(row.location_id) ?? [];
    locationRows.push(row);
    indexed.set(row.location_id, locationRows);
  }
  return indexed;
}

function buildLocationReceipts(
  locationId: number,
  locationName: string | null,
  workCounts: Map<string, number>,
  rankings: ReceiptsReportRankingObservationRow[]
): LocationReceipts {
  return {
    locationId,
    locationName: locationName?.trim() || `Location ${locationId}`,
    gbpPostsPublished: availableField(
      workCounts.get(workCountKey(locationId, LOCAL_POST)) ?? 0
    ),
    gbpReviewRepliesPublished: availableField(
      workCounts.get(workCountKey(locationId, REVIEW_REPLY)) ?? 0
    ),
    rankingMovement: buildRankingMovement(rankings),
    reviewsVsTopCompetitor: buildReviewsVsTopCompetitor(rankings),
  };
}

function buildRankingMovement(
  rows: ReceiptsReportRankingObservationRow[]
): RankingMovementField {
  const groups = new Map<string, ReceiptsReportRankingObservationRow[]>();
  for (const row of rows) {
    if (!Number.isInteger(row.search_position) || row.search_position <= 0) {
      continue;
    }
    const key = `${row.search_position_source ?? "unknown"}\u0000${
      row.search_query ?? ""
    }`;
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }

  const movements = [...groups.values()].map(buildRankingMovementItem);
  return movements.length > 0
    ? { movements, flag: "ok" }
    : { movements: [], flag: "no_observations" };
}

function buildRankingMovementItem(
  rows: ReceiptsReportRankingObservationRow[]
): RankingMovementItem {
  const first = rows[0];
  const last = rows[rows.length - 1];
  const best = selectPosition(rows, (candidate, selected) => candidate < selected);
  const worst = selectPosition(rows, (candidate, selected) => candidate > selected);

  return {
    query: first.search_query,
    source: first.search_position_source,
    first: observationPoint(first),
    last: observationPoint(last),
    best: observationPoint(best),
    worst: observationPoint(worst),
  };
}

function selectPosition(
  rows: ReceiptsReportRankingObservationRow[],
  isPreferred: (candidate: number, selected: number) => boolean
): ReceiptsReportRankingObservationRow {
  return rows.slice(1).reduce(
    (selected, candidate) =>
      isPreferred(candidate.search_position, selected.search_position)
        ? candidate
        : selected,
    rows[0]
  );
}

function observationPoint(
  row: ReceiptsReportRankingObservationRow
): RankingObservationPoint {
  return {
    position: row.search_position,
    observedAt: row.search_checked_at.toISOString(),
  };
}

function buildReviewsVsTopCompetitor(
  rows: ReceiptsReportRankingObservationRow[]
): ReviewsVsTopCompetitorField {
  if (rows.length === 0) return { value: null, flag: "no_observations" };

  const latest = rows[rows.length - 1];
  const searchResults = parseSearchResults(latest.search_results);
  const competitor = searchResults
    .filter((entry) => !entry.isClient)
    .sort((left, right) => left.position - right.position)[0];

  if (!competitor) return { value: null, flag: "no_competitor_data" };

  const client = searchResults.find((entry) => entry.isClient);
  return {
    value: {
      observedAt: latest.search_checked_at.toISOString(),
      query: latest.search_query,
      source: latest.search_position_source,
      clientReviewCount: client?.reviewCount ?? null,
      competitorName: competitor.name,
      competitorReviewCount: competitor.reviewCount,
      competitorPosition: competitor.position,
    },
    flag: "ok",
  };
}

function parseSearchResults(value: unknown): SearchResultReceiptEntry[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isSearchResultReceiptEntry);
}

function isSearchResultReceiptEntry(
  value: unknown
): value is SearchResultReceiptEntry {
  if (!isRecord(value)) return false;
  return (
    typeof value.name === "string" &&
    typeof value.position === "number" &&
    Number.isInteger(value.position) &&
    value.position > 0 &&
    typeof value.reviewCount === "number" &&
    Number.isInteger(value.reviewCount) &&
    value.reviewCount >= 0 &&
    typeof value.isClient === "boolean"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function availableField(value: number): ReceiptField {
  return { value, flag: "ok" };
}

function websiteVisitorsField(result: RybbitPeriodUsersResult): ReceiptField {
  return result.status === "ok"
    ? availableField(result.users)
    : { value: null, flag: result.status };
}

function sumLocations(
  locations: LocationReceipts[],
  field: "gbpPostsPublished" | "gbpReviewRepliesPublished"
): number {
  return locations.reduce(
    (sum, location) => sum + (location[field].value ?? 0),
    0
  );
}

function replacementCostContext(): ReplacementCostContext {
  return {
    lineItems: [
      { service: "SEO", monthlyRate: null },
      { service: "review management", monthlyRate: null },
      { service: "GBP management", monthlyRate: null },
      { service: "website/content", monthlyRate: null },
    ],
    total: null,
    note: "Replacement-cost rates are not staked; no dollar figure is emitted.",
    ratesStaked: false,
  };
}
