/**
 * Ranking Pipeline Stage: Website Audit
 *
 * Step 4 of processLocationRanking, extracted verbatim: audit the client's
 * website (resolved from GBP websiteUri or domain) for NAP consistency.
 *
 * Behavior-preserving: identical status write, audit input shape, failure
 * handling (continue on error), and pipeline-timing record.
 */

import { auditWebsite } from "./service.website-audit";
import { summarizeRetryAttempts } from "./service.ranking-resilience";
import { updateStatus, StatusDetail } from "./service.ranking-status";
import {
  beginPipelineTiming,
  finishPipelineTiming,
  PipelineTimingRecord,
} from "../feature-utils/util.ranking-pipeline-timing";
import { resolveAuditWebsite } from "../feature-utils/util.ranking-pipeline-helpers";

export interface WebsiteAuditStageInput {
  rankingId: number;
  domain: string;
  profileData: any;
  statusDetail: StatusDetail;
  log: (msg: string) => void;
  pipelineTimings: PipelineTimingRecord[];
}

/**
 * Run Step 4 (website audit). Returns the audit result, or null when the audit
 * threw — matching the original "continue without audit" behavior.
 */
export async function runWebsiteAuditStage(
  input: WebsiteAuditStageInput,
): Promise<any> {
  const { rankingId, domain, profileData, statusDetail, log, pipelineTimings } =
    input;

  // ========== STEP 4: Website Audit ==========
  const websiteAuditTiming = beginPipelineTiming("website_audit");
  await updateStatus(
    rankingId,
    "processing",
    "auditing_website",
    "Auditing client website...",
    60,
    statusDetail,
    log,
  );

  let websiteAudit = null;
  const clientWebsite = resolveAuditWebsite(profileData?.websiteUri, domain);
  try {
    websiteAudit = await auditWebsite(clientWebsite, {
      phone:
        profileData?.phoneNumbers?.primaryPhone ||
        profileData?.primaryPhone ||
        null,
      addressLines: [
        ...(profileData?.storefrontAddress?.addressLines || []),
        profileData?.storefrontAddress?.locality,
        profileData?.storefrontAddress?.administrativeArea,
      ].filter(Boolean),
    });
    finishPipelineTiming(
      pipelineTimings,
      websiteAuditTiming,
      websiteAudit.status === "failed" ? "failed" : "success",
      `url=${clientWebsite};status=${websiteAudit.status};${summarizeRetryAttempts(
        websiteAudit.retryAttempts || [],
      )}`,
    );
  } catch (error: any) {
    finishPipelineTiming(
      pipelineTimings,
      websiteAuditTiming,
      "failed",
      error.message,
    );
    log(`[RANKING] [${rankingId}] Website audit failed: ${error.message}`);
  }

  return websiteAudit;
}
