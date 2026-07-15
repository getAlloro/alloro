import { PmsColumnMappingModel } from "../../models/PmsColumnMappingModel";
import { PmsJobModel, type IPmsJob } from "../../models/PmsJobModel";
import type { ColumnMapping } from "../../types/pmsMapping";
import { buildActualProductionByMonth } from "./monthlyProduction";
import { compareMonthKeys } from "./monthKey";

// Threshold (5%) for flagging when sum(sources.referrals) diverges from
// total_referrals on a given month. Informational only — never blocks.
const SOURCE_SUM_TOLERANCE = 0.05;

type RawPmsSource = {
  name?: string;
  referrals?: number | string;
  production?: number | string;
};

type RawPmsMonthEntry = {
  month?: string;
  sources?: RawPmsSource[];
  self_referrals?: number | string;
  total_referrals?: number | string;
  doctor_referrals?: number | string;
  actual_production_total?: number | string;
  attributed_production_total?: number | string;
  production_total?: number | string;
};

type ParserMetadata = {
  referral_count_semantics?: unknown;
  source_referral_count_semantics?: unknown;
};

type AggregatedMonthData = {
  month: string;
  selfReferrals: number;
  doctorReferrals: number;
  totalReferrals: number;
  productionTotal: number;
  actualProductionTotal: number;
  attributedProductionTotal: number;
  reconcileSourceReferralTotal: boolean;
  timestamp: string | Date;
  sources: RawPmsSource[];
};

type AggregatedSourceData = {
  rank: number;
  name: string;
  referrals: number;
  production: number;
  percentage: number;
};

export type SourceTrendData = {
  name: string;
  trend_label: "increasing" | "decreasing" | "new" | "dormant" | "stable";
  referrals_current: number;
  referrals_prior: number | null;
  referrals_delta: number | null;
  production_current: number;
  production_prior: number | null;
};

export type DedupCandidate = {
  name_a: string;
  name_b: string;
  reason: string;
};

export type AggregatedPmsData = {
  months: AggregatedMonthData[];
  sources: AggregatedSourceData[];
  totals: {
    totalReferrals: number;
    totalProduction: number;
    totalAttributedProduction: number;
  };
  patientRecords: any[];
  /**
   * Deterministic data-quality flags computed during aggregation.
   * Surfaced into the LLM input so the agent can echo them in its
   * own data_quality_flags output (see ReferralEngineAnalysis.md →
   * UPSTREAM DATA QUALITY ACKNOWLEDGEMENT).
   */
  dataQualityFlags: string[];
  /** Per-source trend labels computed by comparing the last two months. */
  sourceTrends: SourceTrendData[];
  /** Source name pairs flagged as potential duplicates by string similarity. */
  dedupCandidates: DedupCandidate[];
};

/**
 * Convert various value types to number
 */
const toNumber = (value: unknown): number => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.\-]/g, "");
    const parsed = Number.parseFloat(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

/**
 * Ensure value is an array
 */
const ensureArray = <T>(value: unknown): T[] => {
  if (Array.isArray(value)) {
    return value as T[];
  }
  return [];
};

const parseResponseLogObject = (
  responseLog: unknown,
): Record<string, unknown> | null => {
  if (responseLog === null || responseLog === undefined) {
    return null;
  }

  let candidate: unknown = responseLog;
  if (typeof candidate === "string") {
    try {
      candidate = JSON.parse(candidate);
    } catch {
      return null;
    }
  }

  return typeof candidate === "object" &&
    candidate !== null &&
    !Array.isArray(candidate)
    ? (candidate as Record<string, unknown>)
    : null;
};

/**
 * Whether a job's monthly total can be reconciled against the sum of its
 * source rows. Some PMS exports count distinct patients globally for the
 * monthly total and distinctly again within each source. That declared pair
 * is intentionally non-additive; all legacy and unknown metadata remains
 * additive so the existing quality check stays unchanged by default.
 */
export const shouldReconcileSourceReferralTotal = (
  responseLog: unknown,
): boolean => {
  const container = parseResponseLogObject(responseLog);
  const rawMetadata = container?.parser_metadata;
  if (
    typeof rawMetadata !== "object" ||
    rawMetadata === null ||
    Array.isArray(rawMetadata)
  ) {
    return true;
  }

  const metadata = rawMetadata as ParserMetadata;
  return !(
    metadata.referral_count_semantics === "unique_patient_global" &&
    metadata.source_referral_count_semantics === "unique_patient_per_source"
  );
};

/**
 * Extract month entries from response_log
 */
const extractMonthEntriesFromResponse = (
  responseLog: unknown
): RawPmsMonthEntry[] => {
  if (responseLog === null || responseLog === undefined) {
    return [];
  }

  let candidate: unknown = responseLog;

  if (typeof candidate === "string") {
    try {
      candidate = JSON.parse(candidate);
    } catch (error) {
      return [];
    }
  }

  if (Array.isArray(candidate)) {
    return candidate as RawPmsMonthEntry[];
  }

  if (typeof candidate === "object" && candidate !== null) {
    const container = candidate as Record<string, unknown>;

    // Check for monthly_rollup as the canonical field (primary)
    if (Array.isArray(container.monthly_rollup)) {
      return container.monthly_rollup as RawPmsMonthEntry[];
    }

    // Fallback to report_data for backward compatibility
    if (Array.isArray(container.report_data)) {
      return container.report_data as RawPmsMonthEntry[];
    }
  }

  return [];
};

/**
 * Extract additional_data (patient records) from response_log
 */
const extractAdditionalDataFromResponse = (responseLog: unknown): any[] => {
  if (responseLog === null || responseLog === undefined) {
    return [];
  }

  let candidate: unknown = responseLog;

  if (typeof candidate === "string") {
    try {
      candidate = JSON.parse(candidate);
    } catch (error) {
      return [];
    }
  }

  if (typeof candidate === "object" && candidate !== null) {
    const container = candidate as Record<string, unknown>;

    // Extract additional_data array if present
    if (Array.isArray(container.additional_data)) {
      return container.additional_data;
    }
  }

  return [];
};

const extractRawRowsFromJob = (
  rawInputData: unknown
): Record<string, unknown>[] => {
  if (rawInputData === null || rawInputData === undefined) {
    return [];
  }

  let candidate = rawInputData;
  if (typeof candidate === "string") {
    try {
      candidate = JSON.parse(candidate);
    } catch (error) {
      return [];
    }
  }

  if (typeof candidate !== "object" || candidate === null) {
    return [];
  }

  const container = candidate as Record<string, unknown>;
  return Array.isArray(container.rows)
    ? (container.rows as Record<string, unknown>[])
    : [];
};

const isProcedureLogMapping = (mapping: ColumnMapping): boolean => {
  const hasReferringPractice = mapping.assignments.some(
    (assignment) => assignment.role === "referring_practice"
  );
  const hasSource = mapping.assignments.some(
    (assignment) => assignment.role === "source"
  );
  return hasReferringPractice && !hasSource;
};

const getMappingForJob = async (
  job: IPmsJob,
  cache: Map<number, ColumnMapping | null>
): Promise<ColumnMapping | null> => {
  const mappingId = job.column_mapping_id;
  if (!mappingId) {
    return null;
  }

  if (!cache.has(mappingId)) {
    const mappingRow = await PmsColumnMappingModel.findMappingById(mappingId);
    cache.set(mappingId, mappingRow?.mapping ?? null);
  }

  return cache.get(mappingId) ?? null;
};

const recoverActualProductionByMonth = async (
  job: IPmsJob,
  cache: Map<number, ColumnMapping | null>
): Promise<Map<string, number>> => {
  const rawRows = extractRawRowsFromJob(job.raw_input_data);
  if (!rawRows.length) {
    return new Map();
  }

  const mapping = await getMappingForJob(job, cache);
  if (!mapping || !isProcedureLogMapping(mapping)) {
    return new Map();
  }

  return buildActualProductionByMonth(rawRows, mapping);
};

const addRecoveredOnlyEntries = (
  entries: RawPmsMonthEntry[],
  actualProductionByMonth: Map<string, number>
): RawPmsMonthEntry[] => {
  const knownMonths = new Set(
    entries
      .map((entry) => entry.month?.trim())
      .filter((month): month is string => Boolean(month))
  );
  const recoveredEntries = Array.from(actualProductionByMonth.entries())
    .filter(([month]) => !knownMonths.has(month))
    .map(([month, production]) => ({
      month,
      self_referrals: 0,
      doctor_referrals: 0,
      total_referrals: 0,
      production_total: 0,
      attributed_production_total: 0,
      actual_production_total: production,
      sources: [],
    }));

  return [...entries, ...recoveredEntries];
};

/**
 * Aggregate PMS data across all approved jobs for an organization.
 * This function implements smart deduplication - keeps only the latest data for each month.
 *
 * @param organizationId - The organization to fetch PMS data for
 * @returns Aggregated PMS data with unique months (latest wins) and aggregated sources
 */
export async function aggregatePmsData(
  organizationId: number,
  locationId?: number
): Promise<AggregatedPmsData> {
  const approvedJobs = await PmsJobModel.findApprovedJobsForPmsAggregation(
    organizationId,
    locationId
  );

  if (!approvedJobs.length) {
    return {
      months: [],
      sources: [],
      totals: {
        totalReferrals: 0,
        totalProduction: 0,
        totalAttributedProduction: 0,
      },
      sourceTrends: [],
      dedupCandidates: [],
      patientRecords: [],
      dataQualityFlags: [],
    };
  }

  // Track month data with timestamps to keep only the latest
  const monthMap = new Map<string, AggregatedMonthData>();
  const mappingCache = new Map<number, ColumnMapping | null>();

  // Collect all patient records from all approved jobs
  const allPatientRecords: any[] = [];

  // Process jobs to build month map (keeping only latest data per month)
  for (const job of approvedJobs) {
    const entries = extractMonthEntriesFromResponse(job.response_log);
    const reconcileSourceReferralTotal =
      shouldReconcileSourceReferralTotal(job.response_log);
    const actualProductionByMonth = await recoverActualProductionByMonth(
      job,
      mappingCache
    );
    const allEntries = addRecoveredOnlyEntries(entries, actualProductionByMonth);

    // Extract and collect additional_data (patient records)
    const patientRecords = extractAdditionalDataFromResponse(job.response_log);
    if (patientRecords.length > 0) {
      allPatientRecords.push(...patientRecords);
    }

    if (!allEntries.length) {
      continue;
    }

    const jobTimestamp = job.timestamp;

    for (const entry of allEntries) {
      const monthKey = entry?.month?.trim();

      if (!monthKey) {
        continue;
      }

      const selfReferrals = toNumber(entry.self_referrals);
      const doctorReferrals = toNumber(entry.doctor_referrals);
      const entryTotalReferrals =
        entry.total_referrals !== undefined
          ? toNumber(entry.total_referrals)
          : selfReferrals + doctorReferrals;
      const entryAttributedProductionTotal = toNumber(
        entry.attributed_production_total ?? entry.production_total
      );
      const entryActualProductionTotal =
        entry.actual_production_total !== undefined
          ? toNumber(entry.actual_production_total)
          : actualProductionByMonth.get(monthKey) ??
            entryAttributedProductionTotal;

      const existingMonth = monthMap.get(monthKey);

      // Only update if this job is newer or month doesn't exist
      if (
        !existingMonth ||
        new Date(jobTimestamp) > new Date(existingMonth.timestamp)
      ) {
        monthMap.set(monthKey, {
          month: monthKey,
          selfReferrals,
          doctorReferrals,
          totalReferrals: entryTotalReferrals,
          productionTotal: entryActualProductionTotal,
          actualProductionTotal: entryActualProductionTotal,
          attributedProductionTotal: entryAttributedProductionTotal,
          reconcileSourceReferralTotal,
          timestamp: jobTimestamp,
          sources: ensureArray<RawPmsSource>(entry.sources),
        });
      }
    }
  }

  const MAX_MONTHS = 12;
  // Chronological — month keys can be display labels ("Apr 2026"), and an
  // alphabetical sort made the 12-month cap below keep the WRONG months.
  const allMonthsSorted = Array.from(monthMap.values()).sort((a, b) =>
    compareMonthKeys(a.month, b.month)
  );
  const months =
    allMonthsSorted.length > MAX_MONTHS
      ? allMonthsSorted.slice(-MAX_MONTHS)
      : allMonthsSorted;

  // Aggregate sources and totals from the capped month window
  const sourceMap = new Map<
    string,
    { name: string; referrals: number; production: number }
  >();

  let totalReferrals = 0;
  let totalProduction = 0;
  let totalAttributedProduction = 0;

  for (const monthData of months) {
    totalReferrals += monthData.totalReferrals;
    totalProduction += monthData.productionTotal;
    totalAttributedProduction += monthData.attributedProductionTotal;

    for (const source of monthData.sources) {
      const name = source?.name?.trim();
      if (!name) {
        continue;
      }

      const existing = sourceMap.get(name) ?? {
        name,
        referrals: 0,
        production: 0,
      };

      existing.referrals += toNumber(source.referrals);
      existing.production += toNumber(source.production);

      sourceMap.set(name, existing);
    }
  }

  // Sum reconciliation (D1 in spec): for each month, verify that the sum of
  // per-source referrals matches the month's total_referrals within
  // SOURCE_SUM_TOLERANCE. Anything beyond that gets flagged for the LLM.
  // Skip months where totalReferrals <= 0 (avoid div-by-zero; empty months
  // are valid per the n8n contract).
  const dataQualityFlags: string[] = [];
  if (allMonthsSorted.length > MAX_MONTHS) {
    dataQualityFlags.push(
      `Capped to most recent ${MAX_MONTHS} months of data (${allMonthsSorted.length} months total available).`
    );
  }
  for (const monthData of months) {
    if (
      monthData.totalReferrals <= 0 ||
      !monthData.reconcileSourceReferralTotal
    ) {
      continue;
    }

    const sumOfSourceReferrals = monthData.sources.reduce(
      (acc, s) => acc + (toNumber(s.referrals) || 0),
      0,
    );

    const delta =
      Math.abs(sumOfSourceReferrals - monthData.totalReferrals) /
      monthData.totalReferrals;

    if (delta > SOURCE_SUM_TOLERANCE) {
      dataQualityFlags.push(
        `Sum-of-sources mismatch in ${monthData.month}: sources=${sumOfSourceReferrals}, total=${monthData.totalReferrals}`,
      );
    }
  }

  const sources = Array.from(sourceMap.values())
    .sort((a, b) => b.production - a.production)
    .map((source, index) => {
      const percentageDenominator = totalAttributedProduction || totalProduction;
      const percentage =
        percentageDenominator > 0
          ? Number(((source.production / percentageDenominator) * 100).toFixed(2))
          : 0;

      return {
        rank: index + 1,
        name: source.name,
        referrals: Number(source.referrals.toFixed(2)),
        production: Number(source.production.toFixed(2)),
        percentage,
      };
    });

  // ── Per-source trend computation ──────────────────────────────────
  // Compare the latest month vs the prior month for each source.
  // When only one month exists, all sources get trend_label "new".
  const sortedMonths = [...months].sort((a, b) =>
    compareMonthKeys(a.month, b.month)
  );
  const latestMonth = sortedMonths[sortedMonths.length - 1];
  const priorMonth = sortedMonths.length >= 2
    ? sortedMonths[sortedMonths.length - 2]
    : null;

  const buildSourceMap = (m: AggregatedMonthData | null) => {
    const map = new Map<string, { referrals: number; production: number }>();
    if (!m) return map;
    for (const s of m.sources) {
      const name = s.name?.trim();
      if (name) {
        map.set(name, {
          referrals: toNumber(s.referrals),
          production: toNumber(s.production),
        });
      }
    }
    return map;
  };

  const latestSourceMap = buildSourceMap(latestMonth);
  const priorSourceMap = buildSourceMap(priorMonth);
  const allSourceNames = new Set([
    ...latestSourceMap.keys(),
    ...priorSourceMap.keys(),
  ]);

  const sourceTrends: SourceTrendData[] = [];
  for (const name of allSourceNames) {
    const curr = latestSourceMap.get(name);
    const prev = priorSourceMap.get(name);

    let trend_label: SourceTrendData["trend_label"];
    if (!priorMonth) {
      trend_label = "new";
    } else if (curr && !prev) {
      trend_label = "new";
    } else if (!curr && prev) {
      trend_label = "dormant";
    } else if (curr && prev) {
      if (curr.referrals > prev.referrals) trend_label = "increasing";
      else if (curr.referrals < prev.referrals) trend_label = "decreasing";
      else trend_label = "stable";
    } else {
      trend_label = "stable";
    }

    sourceTrends.push({
      name,
      trend_label,
      referrals_current: curr?.referrals ?? 0,
      referrals_prior: prev?.referrals ?? null,
      referrals_delta:
        curr && prev ? curr.referrals - prev.referrals : null,
      production_current: curr?.production ?? 0,
      production_prior: prev?.production ?? null,
    });
  }

  sourceTrends.sort((a, b) => b.referrals_current - a.referrals_current);

  // ── Duplicate-name candidate detection ──────────────────────────
  // Conservative: flag obvious matches only (normalized Levenshtein ≤ 3
  // or identical first word with both names ≥ 3 words).
  const normalize = (s: string): string =>
    s.toLowerCase()
      .replace(/^dr\.?\s*/i, "")
      .replace(/[^a-z0-9\s]/g, "")
      .replace(/\s+/g, " ")
      .trim();

  const levenshtein = (a: string, b: string): number => {
    const m = a.length;
    const n = b.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () =>
      Array(n + 1).fill(0)
    );
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] =
          a[i - 1] === b[j - 1]
            ? dp[i - 1][j - 1]
            : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
    return dp[m][n];
  };

  const dedupCandidates: DedupCandidate[] = [];
  const sourceNames = sources.map((s) => s.name);
  for (let i = 0; i < sourceNames.length; i++) {
    const normA = normalize(sourceNames[i]);
    const wordsA = normA.split(" ");
    for (let j = i + 1; j < sourceNames.length; j++) {
      const normB = normalize(sourceNames[j]);
      const wordsB = normB.split(" ");
      const dist = levenshtein(normA, normB);

      if (dist <= 3 && dist > 0) {
        dedupCandidates.push({
          name_a: sourceNames[i],
          name_b: sourceNames[j],
          reason: `Levenshtein distance ${dist} on normalized names`,
        });
      } else if (
        wordsA[0] === wordsB[0] &&
        wordsA.length >= 2 &&
        wordsB.length >= 2
      ) {
        dedupCandidates.push({
          name_a: sourceNames[i],
          name_b: sourceNames[j],
          reason: `Same first word "${wordsA[0]}"`,
        });
      }
    }
  }

  return {
    months,
    sources,
    totals: {
      totalReferrals: Number(totalReferrals.toFixed(2)),
      totalProduction: Number(totalProduction.toFixed(2)),
      totalAttributedProduction: Number(totalAttributedProduction.toFixed(2)),
    },
    patientRecords: allPatientRecords,
    dataQualityFlags,
    sourceTrends,
    dedupCandidates,
  };
}
