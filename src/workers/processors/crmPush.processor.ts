/**
 * CRM Push Processor
 *
 * Consumes the `crm-hubspot-push` queue (and future per-vendor siblings).
 *
 * Job payload:  { submissionId, mappingId }
 * Idempotency:  jobId === submissionId (set at enqueue time in T7)
 *               BullMQ refuses duplicate jobIds, so retries on the same
 *               submission are deduped at the queue layer.
 *
 * Outcomes (written to crm_sync_logs with denormalized platform + vendor_form_id):
 *   - success         -> push accepted by vendor
 *   - skipped_flagged -> submission was AI-flagged after enqueue (race window)
 *   - failed          -> 4xx from vendor (auth_failed, form_not_found, etc.)
 *   - no_mapping      -> mapping deleted between enqueue and execution
 *
 * Throws (triggers BullMQ retry with exponential backoff): 429, 5xx, network.
 */

import { Job } from "bullmq";
import { WebsiteIntegrationModel } from "../../models/website-builder/WebsiteIntegrationModel";
import { IntegrationFormMappingModel } from "../../models/website-builder/IntegrationFormMappingModel";
import { CrmSyncLogModel } from "../../models/website-builder/CrmSyncLogModel";
import { FormSubmissionModel } from "../../models/website-builder/FormSubmissionModel";
import {
  flattenSubmissionContents,
  stringifyFlattenedContents,
} from "../../utils/formContentsFlattener";
import { getAdapter } from "../../services/integrations";
import type { MappedFieldPayload, PushResult } from "../../services/integrations/types";
import logger from "../../lib/logger";

export interface CrmPushJobData {
  submissionId: string;
  mappingId: string;
}

const LOG_PREFIX = "[CRM-PUSH]";

export async function processCrmPush(job: Job<CrmPushJobData>): Promise<void> {
  const { submissionId, mappingId } = job.data;

  const submission = await FormSubmissionModel.findById(submissionId);
  if (!submission) {
    logger.warn(`${LOG_PREFIX} Submission ${submissionId} not found; skipping`);
    return;
  }

  const mapping = await IntegrationFormMappingModel.findById(mappingId);
  if (!mapping || mapping.status !== "active") {
    await CrmSyncLogModel.create({
      submission_id: submissionId,
      mapping_id: mapping?.id ?? null,
      integration_id: mapping?.integration_id ?? null,
      platform: null,
      vendor_form_id: mapping?.vendor_form_id ?? null,
      outcome: "no_mapping",
      error: mapping ? `Mapping is ${mapping.status}` : "Mapping deleted before push",
    });
    return;
  }

  const integration = await WebsiteIntegrationModel.findActiveById(mapping.integration_id);
  if (!integration || integration.status !== "active") {
    await CrmSyncLogModel.create({
      submission_id: submissionId,
      mapping_id: mapping.id,
      integration_id: integration?.id ?? null,
      platform: integration?.platform ?? null,
      vendor_form_id: mapping.vendor_form_id,
      outcome: "failed",
      error: integration
        ? `Integration is ${integration.status}`
        : "Integration deleted, archived, or disconnected before push",
    });
    return;
  }

  // Late skip: AI may have flagged the row between enqueue and processing.
  if (submission.is_flagged) {
    await CrmSyncLogModel.create({
      submission_id: submissionId,
      mapping_id: mapping.id,
      integration_id: integration.id,
      platform: integration.platform,
      vendor_form_id: mapping.vendor_form_id,
      outcome: "skipped_flagged",
      error: submission.flag_reason || null,
    });
    return;
  }

  const creds = await WebsiteIntegrationModel.getDecryptedCredentials(integration.id);
  if (!creds) {
    await CrmSyncLogModel.create({
      submission_id: submissionId,
      mapping_id: mapping.id,
      integration_id: integration.id,
      platform: integration.platform,
      vendor_form_id: mapping.vendor_form_id,
      outcome: "failed",
      error: "Failed to decrypt credentials",
    });
    return;
  }

  // Translate website fields → vendor fields via mapping.
  const flat = flattenSubmissionContents(submission.contents);
  const stringified = stringifyFlattenedContents(flat);

  const mappedFields: MappedFieldPayload[] = [];
  for (const [websiteField, vendorField] of Object.entries(mapping.field_mapping ?? {})) {
    const value = stringified[websiteField];
    if (value === undefined || value === null || value === "") continue;
    mappedFields.push({ name: vendorField, value });
  }

  if (mappedFields.length === 0) {
    await CrmSyncLogModel.create({
      submission_id: submissionId,
      mapping_id: mapping.id,
      integration_id: integration.id,
      platform: integration.platform,
      vendor_form_id: mapping.vendor_form_id,
      outcome: "failed",
      error: "No mapped fields had values in this submission",
    });
    return;
  }

  const adapter = getAdapter(integration.platform);
  let result: PushResult;
  try {
    result = await adapter.submitForm(
      creds,
      mapping.vendor_form_id,
      mappedFields,
      {
        ipAddress: submission.sender_ip ?? undefined,
      },
      integration.metadata ?? {},
    );
  } catch (err) {
    // 429 / 5xx / network — log and re-throw so BullMQ retries.
    await CrmSyncLogModel.create({
      submission_id: submissionId,
      mapping_id: mapping.id,
      integration_id: integration.id,
      platform: integration.platform,
      vendor_form_id: mapping.vendor_form_id,
      outcome: "failed",
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }

  // Side effects: status flips on certain outcomes.
  if (result.outcome === "auth_failed") {
    await WebsiteIntegrationModel.updateStatus(
      integration.id,
      "revoked",
      result.error ?? "Vendor rejected credentials at push time",
    );
  } else if (result.outcome === "form_not_found") {
    await IntegrationFormMappingModel.updateStatus(
      mapping.id,
      "broken",
      result.error ?? "Vendor form not found at push time",
    );
  }

  const logOutcome =
    result.outcome === "success" ? "success" : "failed";

  await CrmSyncLogModel.create({
    submission_id: submissionId,
    mapping_id: mapping.id,
    integration_id: integration.id,
    platform: integration.platform,
    vendor_form_id: mapping.vendor_form_id,
    outcome: logOutcome,
    vendor_response_status: result.vendorResponseStatus ?? null,
    vendor_response_body: result.vendorResponseBody ?? null,
    error: result.error ?? null,
  });
}
