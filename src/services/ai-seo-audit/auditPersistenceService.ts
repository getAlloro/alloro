import {
  AiSeoAuditEvidenceModel,
  IAiSeoAuditEvidence,
} from "../../models/website-builder/AiSeoAuditEvidenceModel";
import {
  AiSeoAuditExternalSourceModel,
  IAiSeoAuditExternalSource,
} from "../../models/website-builder/AiSeoAuditExternalSourceModel";
import {
  AiSeoAuditResultModel,
  IAiSeoAuditResult,
} from "../../models/website-builder/AiSeoAuditResultModel";
import {
  AiSeoAuditRunModel,
  IAiSeoAuditRun,
} from "../../models/website-builder/AiSeoAuditRunModel";
import {
  AiSeoAuditTargetModel,
  IAiSeoAuditTarget,
} from "../../models/website-builder/AiSeoAuditTargetModel";
import type { QueryContext } from "../../models/BaseModel";
import { summarizeResults } from "./scoringEngine";
import type {
  AiSeoCheckResultInput,
  AiSeoAuditScope,
  AiSeoHardCap,
  AiSeoConfidence,
  ExternalEntitySourceInput,
} from "./types";

export interface AiSeoAuditDetail {
  run: IAiSeoAuditRun;
  targets: IAiSeoAuditTarget[];
  results: IAiSeoAuditResult[];
  evidence: IAiSeoAuditEvidence[];
  externalSources: IAiSeoAuditExternalSource[];
}

export async function listAuditRuns(filters: {
  organizationId?: number;
  projectId?: string;
  scope?: AiSeoAuditScope;
  limit?: number;
}): Promise<IAiSeoAuditRun[]> {
  return AiSeoAuditRunModel.listRecent(filters);
}

export async function getAuditRunDetail(runId: string): Promise<AiSeoAuditDetail> {
  const run = await AiSeoAuditRunModel.findById(runId);
  if (!run) throw new Error("Audit run not found");

  const [targets, results, externalSources] = await Promise.all([
    AiSeoAuditTargetModel.findByRunId(runId),
    AiSeoAuditResultModel.findByRunId(runId),
    AiSeoAuditExternalSourceModel.findByRunId(runId),
  ]);
  const evidence = await AiSeoAuditEvidenceModel.findByResultIds(
    results.map((result) => result.id),
  );
  return { run, targets, results, evidence, externalSources };
}

export async function persistResults(
  runId: string,
  targetId: string,
  results: AiSeoCheckResultInput[],
  trx?: QueryContext,
): Promise<void> {
  const inserted = await AiSeoAuditResultModel.createMany(
    results.map((result) => ({
      run_id: runId,
      target_id: targetId,
      category: result.category,
      check_id: result.check_id,
      status: result.status,
      weight: result.weight,
      points_awarded: result.points_awarded,
      method: result.method,
      data_scope: result.data_scope,
      remediation: result.remediation || null,
      details: result.details || {},
    })),
    trx,
  );

  const evidenceRows = inserted.flatMap((insertedResult, index) =>
    (results[index]?.evidence || []).map((evidence) => ({
      result_id: insertedResult.id,
      evidence_type: evidence.evidence_type,
      source: evidence.source,
      excerpt: evidence.excerpt || null,
      value: evidence.value || {},
    })),
  );
  await AiSeoAuditEvidenceModel.createMany(evidenceRows, trx);
}

export async function persistExternalSources(
  runId: string,
  targetId: string | null,
  sources: ExternalEntitySourceInput[],
  trx?: QueryContext,
): Promise<void> {
  await AiSeoAuditExternalSourceModel.createMany(
    sources.map((source) => ({
      run_id: runId,
      target_id: targetId,
      query: source.query,
      url: source.url,
      title: source.title || null,
      source_host: source.sourceHost,
      source_type: source.sourceType || null,
      reliability_score: source.reliabilityScore ?? null,
      entity_match_state: source.entityMatchState,
      extracted_fields: source.extractedFields || {},
      compared_fields: source.comparedFields || {},
      metadata: source.metadata || {},
      fetched_at: source.fetchedAt ? new Date(source.fetchedAt) : null,
    })),
    trx,
  );
}

export async function updateRunFromTargets(
  runId: string,
  results: IAiSeoAuditResult[],
  targets: IAiSeoAuditTarget[],
  targetHardCaps: AiSeoHardCap[],
  extras?: { totalPages?: number },
): Promise<void> {
  const summary = summarizeResults(
    results.map((result) => ({
      category: result.category,
      check_id: result.check_id,
      status: result.status,
      weight: Number(result.weight),
      points_awarded: Number(result.points_awarded),
      method: result.method,
      data_scope: result.data_scope,
      remediation: result.remediation,
      details: result.details,
      evidence: [],
    })),
    targetHardCaps,
  );
  // Run score is an importance-weighted average: the homepage counts more than a
  // legal/utility page (weight from target metadata, default 1).
  const scored = targets
    .map((target) => ({
      score: Number(target.score),
      weight: importanceWeightOf(target),
    }))
    .filter((entry) => Number.isFinite(entry.score));
  const weightTotal = scored.reduce((sum, entry) => sum + entry.weight, 0);
  const score = scored.length && weightTotal > 0
    ? clampPercent(
        scored.reduce((sum, entry) => sum + entry.score * entry.weight, 0) / weightTotal,
      )
    : summary.score;
  const targetCoverages = targets
    .map((target) => Number(target.data_coverage))
    .filter((coverage) => Number.isFinite(coverage));
  const dataCoverage = targetCoverages.length
    ? averagePercent(targetCoverages)
    : clampPercent(summary.dataCoverage);

  await AiSeoAuditRunModel.updateRun(runId, {
    status: "completed",
    score: clampNullablePercent(score),
    data_coverage: dataCoverage,
    confidence: confidenceForCoverage(dataCoverage),
    hard_caps: targetHardCaps,
    summary: {
      categories: summary.categories,
      targetCount: targets.length,
      completedTargetCount: targets.filter((target) => target.score !== null).length,
      ...(extras?.totalPages !== undefined ? { totalPages: extras.totalPages } : {}),
    },
    completed_at: new Date(),
  });
}

function importanceWeightOf(target: IAiSeoAuditTarget): number {
  const raw = Number((target.metadata as Record<string, unknown>)?.importanceWeight);
  return Number.isFinite(raw) && raw > 0 ? raw : 1;
}

function averagePercent(values: number[]): number {
  return clampPercent(
    values.reduce((sum, value) => sum + value, 0) / values.length,
  );
}

function clampNullablePercent(value: number | null): number | null {
  return value === null ? null : clampPercent(value);
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(Math.max(0, Math.min(100, value)) * 100) / 100;
}

function confidenceForCoverage(dataCoverage: number): AiSeoConfidence {
  if (dataCoverage >= 80) return "high";
  if (dataCoverage >= 55) return "medium";
  return "low";
}

export async function setRunProgress(
  runId: string,
  step: string,
  detail: Record<string, unknown> = {},
): Promise<void> {
  await AiSeoAuditRunModel.updateRun(runId, {
    summary: {
      progress: { step, detail, updatedAt: new Date().toISOString() },
    },
  });
}

export async function deleteAuditRun(runId: string): Promise<boolean> {
  const deleted = await AiSeoAuditRunModel.deleteById(runId);
  return deleted > 0;
}

export async function deleteAuditRuns(filters: {
  organizationId?: number;
  scope?: AiSeoAuditScope;
}): Promise<number> {
  return AiSeoAuditRunModel.deleteAll(filters);
}

export async function markRunFailed(
  runId: string,
  error: unknown,
): Promise<void> {
  await AiSeoAuditRunModel.updateRun(runId, {
    status: "failed",
    error_code: "AI_SEO_AUDIT_FAILED",
    error_message: error instanceof Error ? error.message : "Audit failed",
    completed_at: new Date(),
  });
}
