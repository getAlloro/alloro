/**
 * Harvest Orchestration service.
 *
 * Business logic for the data-harvest integration lifecycle: validating a
 * harvest connection, listing harvest activity (logs + success rate), and
 * re-enqueueing a failed harvest for a given date.
 *
 * Extracted from WebsiteIntegrationsController.ts. Expected failures throw a
 * typed HarvestOrchestrationError carrying the HTTP status/code/message the
 * controller returned inline. All DB access stays in the models; the queue add
 * lives here so the controller method stays a thin wrapper.
 */

import {
  IntegrationHarvestLogModel,
  type IIntegrationHarvestLog,
} from "../../../models/website-builder/IntegrationHarvestLogModel";
import type { IWebsiteIntegrationSafe } from "../../../models/website-builder/WebsiteIntegrationModel";
import { WebsiteIntegrationModel } from "../../../models/website-builder/WebsiteIntegrationModel";
import { getHarvestAdapter } from "../../../services/integrations/harvest-registry";
import { getHarvestQueue } from "../../../workers/queues";

export class HarvestOrchestrationError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface ValidateHarvestOutcome {
  valid: boolean;
  error?: string;
  message?: string;
}

export interface HarvestLogsResult {
  data: IIntegrationHarvestLog[];
  total: number;
  successRate: Awaited<ReturnType<typeof IntegrationHarvestLogModel.getSuccessRate>>;
}

export interface RerunHarvestResult {
  queued: true;
  harvestDate: string;
  retryCount: number;
}

/**
 * Validate the harvest connection for an integration and persist the result on
 * last_validated_at / last_error. Throws if the platform has no harvest adapter.
 */
export async function validateHarvestConnection(
  integration: IWebsiteIntegrationSafe,
): Promise<ValidateHarvestOutcome> {
  let adapter;
  try {
    adapter = getHarvestAdapter(integration.platform);
  } catch {
    throw new HarvestOrchestrationError(
      400,
      "UNSUPPORTED_PLATFORM",
      `No harvest adapter for platform '${integration.platform}'`,
    );
  }

  const result = await adapter.validateConnection(integration);

  await WebsiteIntegrationModel.updateLastValidated(
    integration.id,
    new Date(),
    result.ok ? null : result.errorMessage ?? null,
  );

  if (!result.ok) {
    return { valid: false, error: result.error, message: result.errorMessage };
  }
  return { valid: true };
}

/**
 * Paginated harvest activity for an integration plus its 30-day success rate.
 */
export async function listHarvestLogs(
  integration: IWebsiteIntegrationSafe,
  pagination: { limit: number; offset: number },
): Promise<HarvestLogsResult> {
  const result = await IntegrationHarvestLogModel.findByIntegrationId(
    integration.id,
    pagination,
  );

  const successRate = await IntegrationHarvestLogModel.getSuccessRate(integration.id, 30);

  return { ...result, successRate };
}

/**
 * Re-enqueue a daily harvest for a specific date. Throws on bad date input or
 * when the per-date retry cap (3) is reached.
 */
export async function rerunHarvest(
  integration: IWebsiteIntegrationSafe,
  harvestDate: string | undefined,
): Promise<RerunHarvestResult> {
  if (!harvestDate || !/^\d{4}-\d{2}-\d{2}$/.test(harvestDate)) {
    throw new HarvestOrchestrationError(
      400,
      "INVALID_INPUT",
      "harvestDate is required (YYYY-MM-DD)",
    );
  }

  const retryCount = await IntegrationHarvestLogModel.getLatestRetryCount(
    integration.id,
    harvestDate,
  );
  if (retryCount >= 3) {
    throw new HarvestOrchestrationError(
      409,
      "MAX_RETRIES",
      "Maximum retry count (3) reached for this date",
    );
  }

  const queue = getHarvestQueue("daily");
  await queue.add(
    "manual-rerun",
    { integrationId: integration.id, harvestDate },
    {
      jobId: `rerun-${integration.id}-${harvestDate}-${Date.now()}`,
      attempts: 1,
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 50 },
    },
  );

  return { queued: true, harvestDate, retryCount: retryCount + 1 };
}
