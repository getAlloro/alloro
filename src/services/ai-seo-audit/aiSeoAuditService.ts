import { getWbQueue } from "../../workers/wb-queues";
import { AiSeoAuditRunModel, IAiSeoAuditRun } from "../../models/website-builder/AiSeoAuditRunModel";
import {
  AiSeoAuditDetail,
  deleteAuditRun,
  deleteAuditRuns,
  getAuditRunDetail,
  listAuditRuns,
  markRunFailed,
  setRunProgress,
  updateRunFromTargets,
} from "./auditPersistenceService";
import { executeTargets } from "./auditTargetExecutionService";
import {
  listAuditableOrganizationIds,
  resolveOrganizationAuditContext,
} from "./organizationAuditContextService";
import { AI_SEO_RULE_VERSION } from "./scoringEngine";

export const AI_SEO_AUDIT_QUEUE = "ai-seo-audit";

async function enqueueAuditRun(runId: string): Promise<void> {
  await getWbQueue(AI_SEO_AUDIT_QUEUE).add(
    "run",
    { runId },
    { jobId: runId, removeOnComplete: { count: 50 }, removeOnFail: { count: 50 } },
  );
}

/**
 * Create a queued URL audit and hand execution to the worker. Returns the
 * queued run detail immediately so the request never blocks on scoring.
 */
export async function createUrlAuditRun(
  url: string,
  userId: number | null,
): Promise<AiSeoAuditDetail> {
  const run = await AiSeoAuditRunModel.createRun({
    scope: "url_only",
    requested_url: url,
    rule_version: AI_SEO_RULE_VERSION,
    created_by_user_id: userId,
  });
  await enqueueAuditRun(run.id);
  return getAuditRunDetail(run.id);
}

/**
 * Create a queued organization audit. Heavy context resolution (GBP/GSC/pages)
 * is deferred to the worker so the launch request stays fast.
 */
export async function createOrganizationAuditRun(
  organizationId: number,
  userId: number | null,
): Promise<AiSeoAuditDetail> {
  const run = await AiSeoAuditRunModel.createRun({
    scope: "organization",
    organization_id: organizationId,
    rule_version: AI_SEO_RULE_VERSION,
    created_by_user_id: userId,
  });
  await enqueueAuditRun(run.id);
  return getAuditRunDetail(run.id);
}

/**
 * Worker entry point. Advances the run through running -> completed/failed and
 * records per-step progress in summary.progress for polling clients.
 */
export async function executeAuditRun(runId: string): Promise<void> {
  const run = await AiSeoAuditRunModel.findById(runId);
  if (!run) throw new Error("Audit run not found");
  if (run.status === "completed" || run.status === "failed") return;

  await AiSeoAuditRunModel.updateRun(runId, {
    status: "running",
    started_at: new Date(),
  });

  try {
    if (run.scope === "url_only") {
      await executeUrlRun(run);
    } else if (run.scope === "organization") {
      await executeOrganizationRun(run);
    } else {
      throw new Error(`Unsupported audit scope: ${run.scope}`);
    }
  } catch (error) {
    await markRunFailed(runId, error);
    throw error; // surface to BullMQ so the job is recorded as failed
  }
}

async function executeUrlRun(run: IAiSeoAuditRun): Promise<void> {
  if (!run.requested_url) throw new Error("URL audit run has no requested URL");
  const detail = await executeTargets(
    run.id,
    [{
      target_type: "site",
      page_id: null,
      location_id: null,
      url: run.requested_url,
      label: "External URL",
      mapping_confidence: null,
      metadata: {},
    }],
    null,
    null,
    (step, info) => setRunProgress(run.id, step, info),
  );
  await updateRunFromTargets(run.id, detail.results, detail.targets, detail.run.hard_caps);
}

async function executeOrganizationRun(run: IAiSeoAuditRun): Promise<void> {
  if (!run.organization_id) throw new Error("Organization audit run has no organization");
  await setRunProgress(run.id, "resolving_organization", { organizationId: run.organization_id });
  const context = await resolveOrganizationAuditContext(run.organization_id);

  await AiSeoAuditRunModel.updateRun(run.id, {
    project_id: context.projectId,
    requested_url: context.projectUrl,
    normalized_url: context.projectUrl,
  });

  if (!context.projectUrl || context.pages.length === 0) {
    await markRunWithoutConnectedSite(run.id, run.organization_id);
    return;
  }

  const targets = context.pages.map((page) => ({
    target_type: "page" as const,
    page_id: page.id,
    location_id: page.locationId,
    url: page.url,
    label: page.title || page.path,
    mapping_confidence: page.mappingConfidence,
    metadata: { path: page.path, importanceWeight: page.importanceWeight },
  }));
  const detail = await executeTargets(
    run.id,
    targets,
    context,
    context.projectIdentity,
    (step, info) => setRunProgress(run.id, step, info),
  );
  await updateRunFromTargets(run.id, detail.results, detail.targets, detail.run.hard_caps, {
    totalPages: context.totalPublishedPages,
  });
}

async function markRunWithoutConnectedSite(
  runId: string,
  organizationId: number,
): Promise<void> {
  await AiSeoAuditRunModel.updateRun(runId, {
    status: "completed",
    score: null,
    data_coverage: 0,
    confidence: "low",
    hard_caps: [{
      code: "NO_CONNECTED_SITE",
      label: "Organization has no connected website project to audit",
      maxScore: 60,
      evidence: { organizationId },
    }],
    summary: {
      message: "Connect a website project before running a full organization audit.",
      categories: [],
    },
    completed_at: new Date(),
  });
}

export {
  getAuditRunDetail,
  listAuditRuns,
  deleteAuditRun,
  deleteAuditRuns,
  listAuditableOrganizationIds,
};
export type { AiSeoAuditDetail };
