import logger from "../../lib/logger";
import {
  AiSeoAuditTargetModel,
  IAiSeoAuditTarget,
} from "../../models/website-builder/AiSeoAuditTargetModel";
import { collectExternalEntitySources } from "./externalEntitySearchService";
import { runGetFoundChecker } from "./getFoundChecker";
import {
  AiSeoAuditDetail,
  getAuditRunDetail,
  persistExternalSources,
  persistResults,
} from "./auditPersistenceService";
import { scoreAuditTarget } from "./scoringEngine";
import { dedupeHardCaps } from "./scoringShared";
import { collectUrlAuditSnapshot } from "./urlCollectorService";
import type {
  AiSeoCheckResultInput,
  AiSeoHardCap,
  ExternalEntitySourceInput,
  ExtractedBusinessIdentity,
  OrganizationAuditContext,
  UrlAuditSnapshot,
} from "./types";

export type AiSeoAuditTargetInput = {
  target_type: "page" | "location" | "site";
  page_id: string | null;
  location_id: number | null;
  url: string;
  label: string | null;
  mapping_confidence: number | null;
  metadata: Record<string, unknown>;
};

export type ExecuteProgress = (step: string, detail: Record<string, unknown>) => Promise<void>;

type PreparedTarget = {
  target: IAiSeoAuditTarget;
  snapshot: UrlAuditSnapshot | null;
  error?: unknown;
};

export async function executeTargets(
  runId: string,
  targets: AiSeoAuditTargetInput[],
  organizationContext: OrganizationAuditContext | null,
  canonicalIdentity: ExtractedBusinessIdentity | null,
  onProgress?: ExecuteProgress,
): Promise<AiSeoAuditDetail> {
  const hardCaps: AiSeoHardCap[] = [];

  // 1. Create target rows and fetch each page snapshot up front.
  const prepared: PreparedTarget[] = [];
  for (const [index, targetInput] of targets.entries()) {
    const target = await AiSeoAuditTargetModel.createTarget({
      run_id: runId,
      target_type: targetInput.target_type,
      page_id: targetInput.page_id,
      location_id: targetInput.location_id,
      url: targetInput.url,
      label: targetInput.label,
      score: null,
      data_coverage: null,
      confidence: null,
      mapping_confidence: targetInput.mapping_confidence,
      metadata: targetInput.metadata,
    });
    await onProgress?.("collecting_pages", {
      current: index + 1,
      total: targets.length,
      url: targetInput.url,
    });
    try {
      prepared.push({ target, snapshot: await collectUrlAuditSnapshot(target.url) });
    } catch (error) {
      prepared.push({ target, snapshot: null, error });
    }
  }

  // 2. Run external entity consistency once per run, keyed on the business identity.
  const firstSnapshot = prepared.find((entry) => entry.snapshot)?.snapshot ?? null;
  const baselineIdentity = pickBaselineIdentity(canonicalIdentity, firstSnapshot);
  let externalSources: ExternalEntitySourceInput[] = [];
  if (firstSnapshot && baselineIdentity) {
    await onProgress?.("external_scan", { business: baselineIdentity.name ?? null });
    externalSources = await collectExternalEntitySources(firstSnapshot, baselineIdentity);
  }

  // 3. Score every fetched target with the shared external sources.
  for (const [index, entry] of prepared.entries()) {
    await onProgress?.("scoring", { current: index + 1, total: prepared.length });
    if (!entry.snapshot) {
      await recordFailedTarget(runId, entry.target, entry.error);
      continue;
    }
    runGetFoundAdvisory(entry.snapshot);
    const output = scoreAuditTarget({
      snapshot: entry.snapshot,
      externalSources,
      organizationContext,
      canonicalIdentity,
    });
    // Tag each cap with the page it fired on so the run-level display can say
    // "on N of M pages" instead of implying the whole run is capped.
    hardCaps.push(
      ...output.summary.hardCaps.map((cap) => ({
        ...cap,
        evidence: {
          ...cap.evidence,
          page: (entry.target.metadata as Record<string, unknown>)?.path ?? entry.target.url,
        },
      })),
    );

    await AiSeoAuditTargetModel.transaction(async (trx) => {
      await AiSeoAuditTargetModel.updateTarget(entry.target.id, {
        score: output.summary.score,
        data_coverage: output.summary.dataCoverage,
        confidence: output.summary.confidence,
        metadata: {
          ...entry.target.metadata,
          finalUrl: entry.snapshot!.finalUrl,
          title: entry.snapshot!.title,
          categorySummary: output.summary.categories,
        },
      }, trx);
      await persistResults(runId, entry.target.id, output.results, trx);
    });
  }

  // 4. Persist external sources once at run level (no single owning target).
  if (externalSources.length > 0) {
    await persistExternalSources(runId, null, externalSources);
  }

  const detail = await getAuditRunDetail(runId);
  return {
    ...detail,
    run: {
      ...detail.run,
      hard_caps: dedupeHardCaps(hardCaps),
    },
  };
}

/**
 * Slice 1a get-found checker — the production call site for the read-only
 * advisory analysis and its observability hook. It runs on every hosted page
 * the audit already fetched, so it costs no extra request.
 *
 * Deliberately bounded to what Slice 1a owns:
 *  - It PERSISTS NOTHING and does not affect the audit score. Routing these
 *    recommendations into the human-approved rail is Slice 1b.
 *  - `gbpIdentity` is omitted, so the GBP<->page consistency flag is skipped.
 *    The audit's canonicalIdentity comes from the website project, NOT from a
 *    GBP profile; passing it here would label a project<->page comparison as a
 *    GBP one. Supplying a real GBP identity lands with Slice 1b.
 *  - No candidate copy exists in a read-only audit, so the honesty gate reports
 *    0 checked. It gates generated copy in Slice 1b.
 *
 * Guarded: an advisory lint must never fail a real audit run.
 */
function runGetFoundAdvisory(snapshot: UrlAuditSnapshot): void {
  try {
    runGetFoundChecker({ url: snapshot.finalUrl, html: snapshot.html });
  } catch (error) {
    logger.warn(
      {
        checker: "get-found",
        url: snapshot.finalUrl,
        error: error instanceof Error ? error.message : String(error),
      },
      "[get-found] advisory checker failed; audit run continues",
    );
  }
}

function pickBaselineIdentity(
  canonical: ExtractedBusinessIdentity | null,
  snapshot: UrlAuditSnapshot | null,
): ExtractedBusinessIdentity | null {
  const base = snapshot?.identity ?? null;
  if (!canonical) return base && hasIdentity(base) ? base : null;
  const merged: ExtractedBusinessIdentity = {
    name: canonical.name || base?.name || null,
    phone: canonical.phone || base?.phone || null,
    address: canonical.address || base?.address || null,
    website: canonical.website || base?.website || null,
    sameAs: canonical.sameAs?.length ? canonical.sameAs : base?.sameAs,
  };
  return hasIdentity(merged) ? merged : null;
}

function hasIdentity(identity: ExtractedBusinessIdentity): boolean {
  return Boolean(identity.name || identity.phone || identity.address);
}

async function recordFailedTarget(
  runId: string,
  target: IAiSeoAuditTarget,
  error: unknown,
): Promise<void> {
  const message = error instanceof Error ? error.message : "URL fetch failed";
  const failedResult: AiSeoCheckResultInput = {
    category: "access_indexability",
    check_id: "access.fetch_failed",
    status: "fail",
    weight: 25,
    points_awarded: 0,
    method: "deterministic",
    data_scope: "url",
    remediation: "Resolve fetch, DNS, redirect, or SSRF-safety blockers before the URL can be audited.",
    details: { error: message },
    evidence: [{
      evidence_type: "fetch_error",
      source: target.url,
      value: { error: message },
    }],
  };
  await persistResults(runId, target.id, [failedResult]);
  await AiSeoAuditTargetModel.updateTarget(target.id, {
    score: 0,
    data_coverage: 25,
    confidence: "low",
    metadata: { ...target.metadata, error: message },
  });
}
