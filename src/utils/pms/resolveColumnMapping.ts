import { PmsColumnMappingModel } from "../../models/PmsColumnMappingModel";
import type { ColumnMapping } from "../../types/pmsMapping";
import { inferColumnMapping } from "./columnMappingInference";
import { signHeaders } from "./headerSignature";
import logger from "../../lib/logger";

/**
 * Three-tier mapping resolver (per spec D1):
 *   Tier 1: org-scoped cache hit on header signature.
 *   Tier 2: global-library hit on header signature (engineering-curated).
 *   Tier 3: AI inference via Haiku 4.5.
 *
 * Order is non-negotiable: never reverse, never merge tiers. Each lookup
 * runs once; the first hit wins.
 *
 * Logging: every resolution emits a structured `[pms-mapping]` line so
 * engineering can identify popular signatures for promotion into the
 * global library.
 */

export type MappingSource =
  | "org-cache"
  | "global-library"
  | "ai-inference";

export interface ResolveResult {
  mapping: ColumnMapping;
  source: MappingSource;
  confidence: number;
  /** When set, the caller can attach this to `pms_jobs.column_mapping_id`. */
  cachedMappingId?: number;
  /** True when the global-library hit asks the user to re-confirm. */
  requireConfirmation?: boolean;
  /** The header signature; surfaced for telemetry / debugging. */
  signature: string;
}

/**
 * Build an empty `ColumnMapping` where every header is `ignore` and confidence
 * is 0. Used as the fallback shape when AI inference fails — the UI surfaces
 * a "Could not auto-map. Please configure your column mapping manually."
 * banner and the user fills the dropdowns from scratch.
 */
function emptyMapping(headers: string[]): ColumnMapping {
  return {
    headers: [...headers],
    assignments: headers.map((header) => ({
      header,
      role: "ignore" as const,
      confidence: 0,
    })),
  };
}

/**
 * Compute mean confidence across the LLM-returned assignments.
 * Used for the AI-inference branch's `confidence` field. Returns 0 for
 * empty arrays.
 */
function averageAssignmentConfidence(
  assignments: ReadonlyArray<{ confidence: number }>
): number {
  if (assignments.length === 0) return 0;
  const sum = assignments.reduce((acc, a) => acc + a.confidence, 0);
  return sum / assignments.length;
}

function logResolution(args: {
  signature: string;
  source: MappingSource;
  confidence: number;
  orgId: number;
  success: boolean;
}): void {
  logger.info({ detail: JSON.stringify({
          signatureHash: args.signature,
          source: args.source,
          confidence: args.confidence,
          orgId: args.orgId,
          success: args.success,
          timestamp: new Date().toISOString(),
        }) }, "[pms-mapping]");
}

/**
 * Resolve a mapping for a given org + file shape.
 *
 * @param orgId - Organization id (for Tier 1 lookup).
 * @param headers - File's column headers in original order.
 * @param sampleRows - First N rows (for Tier 3 LLM inference). Caller is
 *   responsible for truncation; the inference layer further caps to 10.
 */
export async function resolveMapping(
  orgId: number,
  headers: string[],
  sampleRows: Record<string, unknown>[]
): Promise<ResolveResult> {
  const signature = signHeaders(headers);

  // Tier 1: org cache.
  const orgCached = await PmsColumnMappingModel.findByOrgAndSignature(
    orgId,
    signature
  );
  if (orgCached) {
    // Fire-and-forget usage bump; failures here are non-fatal.
    PmsColumnMappingModel.touchUsage(orgCached.id).catch((err) => {
      logger.warn(
        `[pms-mapping] touchUsage failed for org-cache id=${orgCached.id}: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    });
    logResolution({
      signature,
      source: "org-cache",
      confidence: 1.0,
      orgId,
      success: true,
    });
    return {
      mapping: orgCached.mapping,
      source: "org-cache",
      confidence: 1.0,
      cachedMappingId: orgCached.id,
      requireConfirmation: orgCached.require_confirmation,
      signature,
    };
  }

  // Tier 2: global library.
  const globalCached = await PmsColumnMappingModel.findGlobalBySignature(
    signature
  );
  if (globalCached) {
    PmsColumnMappingModel.touchUsage(globalCached.id).catch((err) => {
      logger.warn(
        `[pms-mapping] touchUsage failed for global-library id=${globalCached.id}: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    });
    logResolution({
      signature,
      source: "global-library",
      confidence: 1.0,
      orgId,
      success: true,
    });
    return {
      mapping: globalCached.mapping,
      source: "global-library",
      confidence: 1.0,
      cachedMappingId: globalCached.id,
      requireConfirmation: globalCached.require_confirmation,
      signature,
    };
  }

  // Tier 3: AI inference.
  const inferred = await inferColumnMapping(headers, sampleRows);

  if (inferred === null) {
    logResolution({
      signature,
      source: "ai-inference",
      confidence: 0,
      orgId,
      success: false,
    });
    return {
      mapping: emptyMapping(headers),
      source: "ai-inference",
      confidence: 0,
      signature,
    };
  }

  const mapping: ColumnMapping = {
    headers: [...headers],
    assignments: inferred.assignments,
    productionFormula: inferred.productionFormula,
    statusFilter: inferred.statusFilter,
  };
  const confidence = averageAssignmentConfidence(inferred.assignments);

  logResolution({
    signature,
    source: "ai-inference",
    confidence,
    orgId,
    success: true,
  });

  return {
    mapping,
    source: "ai-inference",
    confidence,
    signature,
  };
}
