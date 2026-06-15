/**
 * PMS Paste Sanitization Service
 *
 * Smart deduplication for parsed PMS rows:
 * 1. JS groups rows by source name (exact match, case-insensitive)
 * 2. JS finds fuzzy-similar groups via Levenshtein + Jaccard
 * 3. AI verdict on fuzzy groups (chunked, ~10 groups per call)
 * 4. JS merges confirmed duplicates — sums referrals + production
 *
 * Stateless — no database writes.
 */

import { loadPrompt } from "../../../agents/service.prompt-loader";
import { runAgent } from "../../../agents/service.llm-runner";
import { parseAgentJson } from "../pms-utils/agent-json-parse.util";
import logger from "../../../lib/logger";

const MODEL = "claude-haiku-4-5-20251001";
const GROUPS_PER_AI_CHUNK = 10;

// =====================================================================
// TYPES
// =====================================================================

export interface SanitizationRow {
  source: string;
  type: "self" | "doctor";
  referrals: number;
  production: number;
  month: string;
}

export interface DuplicateGroup {
  groupId: number;
  rows: SanitizationRow[];
  distinctNames: string[];
  similarity: number;
}

export interface MergeGroup {
  canonicalName: string;
  canonicalType: "self" | "doctor";
  sourceNames: string[];
  rows: SanitizationRow[];
}

export interface SanitizationResult {
  /** All final rows after dedup (merged + unique combined) */
  allRows: SanitizationRow[];
  mergeGroups: MergeGroup[];
  reasoning: string[];
  warnings: string[];
  stats: {
    totalInputRows: number;
    exactGroupsMerged: number;
    fuzzyGroupsFound: number;
    fuzzyGroupsConfirmed: number;
    uniqueSourcesAfter: number;
  };
}

// =====================================================================
// SIMILARITY HELPERS
// =====================================================================

function normalizeForComparison(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()'"]/g, " ")
    .replace(/\b(dr|drs|doctor|doctors|dds|dmd|md|pc|llc|inc|pllc|pa)\b/g, "")
    .replace(/\b(dental|dentistry|dentist|orthodontics|periodontics|endodontics)\b/g, "")
    .replace(/\b(care|clinic|center|centre|office|group|practice|associates|assoc)\b/g, "")
    .replace(/\b(the|and|of|at|in|for|a|an)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(name: string): Set<string> {
  const normalized = normalizeForComparison(name);
  return new Set(normalized.split(" ").filter((t) => t.length > 1));
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
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
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  const intersection = new Set([...a].filter((x) => b.has(x)));
  const union = new Set([...a, ...b]);
  return intersection.size / union.size;
}

function computeSimilarity(nameA: string, nameB: string): number {
  const normA = normalizeForComparison(nameA);
  const normB = normalizeForComparison(nameB);
  if (normA === normB) return 1.0;

  const maxLen = Math.max(normA.length, normB.length);
  const levSim = maxLen > 0 ? 1 - levenshtein(normA, normB) / maxLen : 1;

  const jaccard = jaccardSimilarity(tokenize(nameA), tokenize(nameB));

  return Math.max(levSim, jaccard);
}

const SIMILARITY_THRESHOLD = 0.65;

// =====================================================================
// STEP 1: GROUP BY SOURCE NAME
// =====================================================================

interface GroupedSource {
  canonicalName: string; // original casing from first occurrence
  type: "self" | "doctor";
  totalReferrals: number;
  totalProduction: number;
  months: Map<string, { referrals: number; production: number }>;
  originalRows: SanitizationRow[];
}

/**
 * Group rows by exact source name (case-insensitive).
 * Each group aggregates referrals + production per month.
 */
function groupByExactName(rows: SanitizationRow[]): Map<string, GroupedSource> {
  const groups = new Map<string, GroupedSource>();

  for (const row of rows) {
    const key = row.source.toLowerCase().trim();
    let group = groups.get(key);

    if (!group) {
      group = {
        canonicalName: row.source,
        type: row.type,
        totalReferrals: 0,
        totalProduction: 0,
        months: new Map(),
        originalRows: [],
      };
      groups.set(key, group);
    }

    // doctor takes priority
    if (row.type === "doctor") group.type = "doctor";

    group.totalReferrals += row.referrals;
    group.totalProduction += row.production;
    group.originalRows.push(row);

    const monthData = group.months.get(row.month);
    if (monthData) {
      monthData.referrals += row.referrals;
      monthData.production += row.production;
    } else {
      group.months.set(row.month, { referrals: row.referrals, production: row.production });
    }
  }

  return groups;
}

/**
 * Convert a GroupedSource into SanitizationRow[] (one per month).
 */
function groupToRows(group: GroupedSource): SanitizationRow[] {
  const rows: SanitizationRow[] = [];
  for (const [month, data] of group.months) {
    rows.push({
      source: group.canonicalName,
      type: group.type,
      referrals: data.referrals,
      production: data.production,
      month,
    });
  }
  return rows;
}

// =====================================================================
// STEP 2: FIND FUZZY SIMILAR GROUPS
// =====================================================================

/**
 * Find fuzzy-similar source names among grouped sources.
 * Returns groups with 2+ distinct name variants.
 */
function findFuzzyGroups(
  groupedSources: Map<string, GroupedSource>
): { fuzzyGroups: DuplicateGroup[]; uniqueKeys: string[] } {
  const keys = Array.from(groupedSources.keys());
  const used = new Set<string>();
  const fuzzyGroups: DuplicateGroup[] = [];
  let groupId = 0;

  for (let i = 0; i < keys.length; i++) {
    if (used.has(keys[i])) continue;

    const cluster: string[] = [keys[i]];

    for (let j = i + 1; j < keys.length; j++) {
      if (used.has(keys[j])) continue;
      const sim = computeSimilarity(keys[i], keys[j]);
      if (sim >= SIMILARITY_THRESHOLD) {
        cluster.push(keys[j]);
        used.add(keys[j]);
      }
    }

    if (cluster.length > 1) {
      used.add(keys[i]);

      // Collect all original rows from all grouped sources in this cluster
      const allRows: SanitizationRow[] = [];
      const distinctNames: string[] = [];
      for (const key of cluster) {
        const src = groupedSources.get(key)!;
        distinctNames.push(src.canonicalName);
        allRows.push(...src.originalRows);
      }

      const avgSim = cluster
        .slice(1)
        .reduce((sum, k) => sum + computeSimilarity(keys[i], k), 0) /
        (cluster.length - 1);

      fuzzyGroups.push({ groupId: groupId++, rows: allRows, distinctNames, similarity: avgSim });
    }
  }

  // Keys not in any fuzzy group
  const uniqueKeys = keys.filter((k) => !used.has(k));

  return { fuzzyGroups, uniqueKeys };
}

// =====================================================================
// STEP 3: AI DEDUP (CHUNKED)
// =====================================================================

interface SanitizationDecision {
  groupId: number;
  action: "merge" | "split";
  canonicalName?: string;
  canonicalType?: "self" | "doctor";
  reason?: string;
}

/**
 * Run AI sanitization on a chunk of fuzzy groups.
 * Sends only distinct names, returns merge/split decisions.
 */
async function runSanitizationChunk(
  groups: DuplicateGroup[]
): Promise<SanitizationDecision[]> {
  const systemPrompt = loadPrompt("pmsAgents/PasteSanitizer");

  const payload = groups.map((g) => ({
    groupId: g.groupId,
    similarity: g.similarity.toFixed(2),
    distinctNames: g.distinctNames,
  }));

  const userMessage = `Review these potential duplicate groups and determine which sources should be merged:\n\n${JSON.stringify(payload, null, 2)}`;

  logger.info(
    `[PMS-Sanitizer] AI chunk: ${groups.length} groups, ${groups.reduce((n, g) => n + g.distinctNames.length, 0)} distinct names`
  );

  const agentOptions = {
    systemPrompt,
    userMessage,
    model: MODEL,
    maxTokens: 4096,
  };

  const result = await runAgent(agentOptions);

  logger.info(
    `[PMS-Sanitizer] AI chunk response: ${result.inputTokens} in / ${result.outputTokens} out`
  );

  const parsed = await parseAgentJson<{ decisions: SanitizationDecision[] }>(
    result.raw,
    agentOptions,
    "Sanitizer"
  );

  return Array.isArray(parsed.decisions) ? parsed.decisions : [];
}

/**
 * Run AI dedup on all fuzzy groups, chunked into batches.
 */
async function runChunkedSanitization(
  groups: DuplicateGroup[]
): Promise<SanitizationDecision[]> {
  const allDecisions: SanitizationDecision[] = [];

  for (let i = 0; i < groups.length; i += GROUPS_PER_AI_CHUNK) {
    const chunk = groups.slice(i, i + GROUPS_PER_AI_CHUNK);
    const chunkIdx = Math.floor(i / GROUPS_PER_AI_CHUNK) + 1;
    const totalChunks = Math.ceil(groups.length / GROUPS_PER_AI_CHUNK);

    logger.info(`[PMS-Sanitizer] Processing AI chunk ${chunkIdx}/${totalChunks}...`);

    const decisions = await runSanitizationChunk(chunk);
    allDecisions.push(...decisions);
  }

  return allDecisions;
}

// =====================================================================
// MAIN: sanitizeParsedData
// =====================================================================

/**
 * Smart deduplication pipeline:
 * 1. Group by exact name → aggregate referrals + production per month
 * 2. Find fuzzy-similar groups via Levenshtein + Jaccard
 * 3. AI verdict on fuzzy groups (chunked)
 * 4. Apply merge decisions
 */
export async function sanitizeParsedData(
  allRows: SanitizationRow[]
): Promise<SanitizationResult> {
  if (!allRows || allRows.length === 0) {
    return {
      allRows: [],
      mergeGroups: [],
      reasoning: [],
      warnings: ["No rows provided for sanitization"],
      stats: { totalInputRows: 0, exactGroupsMerged: 0, fuzzyGroupsFound: 0, fuzzyGroupsConfirmed: 0, uniqueSourcesAfter: 0 },
    };
  }

  logger.info(`[PMS-Sanitizer] Starting sanitization of ${allRows.length} rows`);

  // Step 1: Group by exact name
  const groupedSources = groupByExactName(allRows);
  const exactGroupsMerged = Array.from(groupedSources.values()).filter(
    (g) => g.originalRows.length > 1
  ).length;

  logger.info(
    `[PMS-Sanitizer] Exact grouping: ${allRows.length} rows → ${groupedSources.size} unique sources (${exactGroupsMerged} had duplicates)`
  );

  // Step 2: Find fuzzy groups
  const { fuzzyGroups, uniqueKeys } = findFuzzyGroups(groupedSources);

  logger.info(
    `[PMS-Sanitizer] Fuzzy detection: ${fuzzyGroups.length} potential groups, ${uniqueKeys.length} unique sources`
  );

  // Collect unique (non-fuzzy) rows
  const uniqueRows: SanitizationRow[] = [];
  for (const key of uniqueKeys) {
    uniqueRows.push(...groupToRows(groupedSources.get(key)!));
  }

  const mergeGroups: MergeGroup[] = [];
  const reasoning: string[] = [];

  // If no fuzzy groups, we're done with just exact dedup
  if (fuzzyGroups.length === 0) {
    logger.info("[PMS-Sanitizer] No fuzzy duplicates, skipping AI");
    return {
      allRows: uniqueRows,
      mergeGroups,
      reasoning,
      warnings: [],
      stats: {
        totalInputRows: allRows.length,
        exactGroupsMerged,
        fuzzyGroupsFound: 0,
        fuzzyGroupsConfirmed: 0,
        uniqueSourcesAfter: uniqueRows.length,
      },
    };
  }

  // Step 3: AI verdict (chunked)
  const decisions = await runChunkedSanitization(fuzzyGroups);

  const decisionMap = new Map<number, SanitizationDecision>();
  for (const d of decisions) decisionMap.set(d.groupId, d);

  const mergeCount = decisions.filter((d) => d.action === "merge").length;
  logger.info(
    `[PMS-Sanitizer] AI verdict: ${mergeCount} merge, ${decisions.length - mergeCount} split`
  );

  // Step 4: Apply decisions
  const mergedRows: SanitizationRow[] = [];

  for (const group of fuzzyGroups) {
    const decision = decisionMap.get(group.groupId);

    if (!decision || decision.action === "split") {
      // Not duplicates — expand each distinct name's grouped rows back
      for (const name of group.distinctNames) {
        const key = name.toLowerCase().trim();
        const src = groupedSources.get(key);
        if (src) uniqueRows.push(...groupToRows(src));
      }
      if (decision?.reason) {
        reasoning.push(`Split: ${group.distinctNames.join(" ≠ ")} — ${decision.reason}`);
      }
      continue;
    }

    // Merge: combine all rows under canonical name
    const canonicalName = decision.canonicalName || group.distinctNames[0];
    const canonicalType = decision.canonicalType || "self";

    if (decision.reason) {
      reasoning.push(`Merged → "${canonicalName}": ${decision.reason}`);
    }

    mergeGroups.push({
      canonicalName,
      canonicalType,
      sourceNames: group.distinctNames,
      rows: group.rows,
    });

    // Aggregate all rows from all names in this fuzzy group per month
    const monthMap = new Map<string, { referrals: number; production: number }>();
    for (const name of group.distinctNames) {
      const key = name.toLowerCase().trim();
      const src = groupedSources.get(key);
      if (!src) continue;
      for (const [month, data] of src.months) {
        const existing = monthMap.get(month);
        if (existing) {
          existing.referrals += data.referrals;
          existing.production += data.production;
        } else {
          monthMap.set(month, { referrals: data.referrals, production: data.production });
        }
      }
    }

    for (const [month, totals] of monthMap) {
      mergedRows.push({
        source: canonicalName,
        type: canonicalType,
        referrals: totals.referrals,
        production: totals.production,
        month,
      });
    }
  }

  const finalRows = [...uniqueRows, ...mergedRows];
  const uniqueSourcesAfter = new Set(
    finalRows.map((r) => r.source.toLowerCase().trim())
  ).size;

  const result: SanitizationResult = {
    allRows: finalRows,
    mergeGroups,
    reasoning,
    warnings: [],
    stats: {
      totalInputRows: allRows.length,
      exactGroupsMerged,
      fuzzyGroupsFound: fuzzyGroups.length,
      fuzzyGroupsConfirmed: mergeCount,
      uniqueSourcesAfter,
    },
  };

  logger.info({ detail: JSON.stringify(result.stats) }, `[PMS-Sanitizer] Final stats:`);

  return result;
}
