/**
 * Website Integrations Controller
 *
 * Thin HTTP layer for per-website integrations (CRM push, GSC, Rybbit, Clarity,
 * data harvest). Each handler parses input, delegates business logic to a
 * feature-service, and shapes the response. Shared response + error-mapping
 * helpers live in feature-utils/util.integration-responses.
 *
 * Endpoints (mounted under /api/admin/websites/:id):
 *   GET    /integrations                                      list
 *   POST   /integrations                                      create (validates token)
 *   GET    /detected-forms                                    list website forms from submissions
 *   GET    /detected-forms/:formName/field-shape              field shape sample
 *   GET    /integrations/:integrationId                       detail (SAFE)
 *   PUT    /integrations/:integrationId                       update
 *   DELETE /integrations/:integrationId                       hard delete
 *   POST   /integrations/:integrationId/revoke                soft revoke
 *   GET    /integrations/:integrationId/vendor-forms          live forms list (no cache)
 *   POST   /integrations/:integrationId/validate-mappings     cross-reference + update broken status
 *   POST   /integrations/:integrationId/infer-mapping         auto-default field map suggestion
 *   GET    /integrations/:integrationId/sync-logs             paginated push history
 *   GET    /integrations/:integrationId/mappings              list
 *   POST   /integrations/:integrationId/mappings              create
 *   PUT    /integrations/:integrationId/mappings/:mappingId   update
 *   DELETE /integrations/:integrationId/mappings/:mappingId   delete
 */

import { Request, Response } from "express";
import { WebsiteIntegrationModel } from "../../models/website-builder/WebsiteIntegrationModel";
import { IntegrationFormMappingModel } from "../../models/website-builder/IntegrationFormMappingModel";
import { CrmSyncLogModel } from "../../models/website-builder/CrmSyncLogModel";
import { IntegrationHarvestLogModel } from "../../models/website-builder/IntegrationHarvestLogModel";
import { getAdapter } from "../../services/integrations";
import * as formDetection from "./feature-services/service.form-detection";
import * as clarityIntegration from "./feature-services/service.clarity-integration";
import * as gscIntegration from "./feature-services/service.gsc-integration";
import * as gscPerformance from "./feature-services/service.gsc-performance";
import { findCtrOpportunities } from "./feature-utils/ctrOpportunity";
import * as harvestLogInspector from "./feature-services/service.harvest-log-inspector";
import * as rybbitHistory from "./feature-services/service.rybbit-history";
import * as rybbitIntegration from "./feature-services/service.rybbit-integration";
import * as rybbitProvisioning from "./feature-services/service.rybbit";
import * as rybbitPerformance from "./feature-services/service.rybbit-performance";
import * as crmIntegration from "./feature-services/service.crm-integration";
import { CrmIntegrationError } from "./feature-services/service.crm-integration";
import * as harvestOrchestration from "./feature-services/service.harvest-orchestration";
import { HarvestOrchestrationError } from "./feature-services/service.harvest-orchestration";
import {
  LOG_PREFIX,
  ok,
  fail,
  failClarityError,
  failGscError,
  failRybbitError,
  failRybbitHistoryError,
  getAdminGscActor,
} from "./feature-utils/util.integration-responses";
import logger from "../../lib/logger";

/**
 * Verify that the integration belongs to the website project in the URL.
 * Returns the integration row on success, or sends a 404 and returns null.
 */
async function loadIntegrationForProject(
  req: Request,
  res: Response,
): Promise<Awaited<ReturnType<typeof WebsiteIntegrationModel.findById>> | null> {
  const projectId = String(req.params.id);
  const integrationId = String(req.params.integrationId);
  const integration = await WebsiteIntegrationModel.findById(integrationId);
  if (!integration || integration.project_id !== projectId) {
    fail(res, 404, "NOT_FOUND", "Integration not found for this website");
    return null;
  }
  return integration;
}

async function loadMappingForIntegration(
  req: Request,
  res: Response,
  integrationId: string,
) {
  const mappingId = String(req.params.mappingId);
  const mapping = await IntegrationFormMappingModel.findById(mappingId);
  if (!mapping || mapping.integration_id !== integrationId) {
    fail(res, 404, "NOT_FOUND", "Mapping not found for this integration");
    return null;
  }
  return mapping;
}

// ---------------------------------------------------------------------------
// Detected forms (read-only from form_submissions)
// ---------------------------------------------------------------------------

export async function listDetectedForms(req: Request, res: Response): Promise<Response> {
  try {
    const projectId = String(req.params.id);
    const data = await formDetection.listDetectedForms(projectId);
    return ok(res, data);
  } catch (error) {
    logger.error({ err: error }, `${LOG_PREFIX} listDetectedForms failed:`);
    return fail(res, 500, "FETCH_ERROR", "Failed to list detected forms");
  }
}

export async function getDetectedFormFieldShape(req: Request, res: Response): Promise<Response> {
  try {
    const projectId = String(req.params.id);
    const formName = String(req.params.formName);
    const sampleSize = Math.min(
      parseInt(String(req.query.sampleSize ?? "20"), 10) || 20,
      100,
    );
    const data = await formDetection.getFormFieldShape(projectId, formName, sampleSize);
    return ok(res, data);
  } catch (error) {
    logger.error({ err: error }, `${LOG_PREFIX} getDetectedFormFieldShape failed:`);
    return fail(res, 500, "FETCH_ERROR", "Failed to fetch form field shape");
  }
}

// ---------------------------------------------------------------------------
// Integrations CRUD
// ---------------------------------------------------------------------------

export async function listIntegrations(req: Request, res: Response): Promise<Response> {
  try {
    const projectId = String(req.params.id);
    const data = await WebsiteIntegrationModel.findByProjectId(projectId);
    return ok(res, data);
  } catch (error) {
    logger.error({ err: error }, `${LOG_PREFIX} listIntegrations failed:`);
    return fail(res, 500, "FETCH_ERROR", "Failed to list integrations");
  }
}

export async function getIntegration(req: Request, res: Response): Promise<Response> {
  try {
    const integration = await loadIntegrationForProject(req, res);
    if (!integration) return res;
    return ok(res, integration);
  } catch (error) {
    logger.error({ err: error }, `${LOG_PREFIX} getIntegration failed:`);
    return fail(res, 500, "FETCH_ERROR", "Failed to fetch integration");
  }
}

export async function createIntegration(req: Request, res: Response): Promise<Response> {
  try {
    const projectId = String(req.params.id);
    const integration = await crmIntegration.createIntegration(
      projectId,
      req.body as crmIntegration.CreateIntegrationInput,
    );
    return ok(res, integration, 201);
  } catch (error) {
    if (error instanceof CrmIntegrationError) {
      return fail(res, error.status, error.code, error.message);
    }
    logger.error({ err: error }, `${LOG_PREFIX} createIntegration failed:`);
    return fail(res, 500, "CREATE_ERROR", "Failed to create integration");
  }
}

export async function updateIntegration(req: Request, res: Response): Promise<Response> {
  try {
    const integration = await loadIntegrationForProject(req, res);
    if (!integration) return res;

    const updated = await crmIntegration.updateIntegration(
      integration,
      req.body as crmIntegration.UpdateIntegrationInput,
    );
    return ok(res, updated);
  } catch (error) {
    if (error instanceof CrmIntegrationError) {
      return fail(res, error.status, error.code, error.message);
    }
    logger.error({ err: error }, `${LOG_PREFIX} updateIntegration failed:`);
    return fail(res, 500, "UPDATE_ERROR", "Failed to update integration");
  }
}

export async function deleteIntegration(req: Request, res: Response): Promise<Response> {
  try {
    const integration = await loadIntegrationForProject(req, res);
    if (!integration) return res;
    await WebsiteIntegrationModel.deleteById(integration.id);
    return ok(res, { deleted: true });
  } catch (error) {
    logger.error({ err: error }, `${LOG_PREFIX} deleteIntegration failed:`);
    return fail(res, 500, "DELETE_ERROR", "Failed to delete integration");
  }
}

export async function revokeIntegration(req: Request, res: Response): Promise<Response> {
  try {
    const integration = await loadIntegrationForProject(req, res);
    if (!integration) return res;
    await WebsiteIntegrationModel.updateStatus(integration.id, "revoked");
    const updated = await WebsiteIntegrationModel.findById(integration.id);
    return ok(res, updated);
  } catch (error) {
    logger.error({ err: error }, `${LOG_PREFIX} revokeIntegration failed:`);
    return fail(res, 500, "REVOKE_ERROR", "Failed to revoke integration");
  }
}

// ---------------------------------------------------------------------------
// Vendor forms (live, no cache)
// ---------------------------------------------------------------------------

export async function listVendorForms(req: Request, res: Response): Promise<Response> {
  try {
    const integration = await loadIntegrationForProject(req, res);
    if (!integration) return res;
    if (integration.status !== "active") {
      return fail(res, 409, "INACTIVE", `Integration is ${integration.status}`);
    }

    const creds = await WebsiteIntegrationModel.getDecryptedCredentials(integration.id);
    if (!creds) {
      return fail(res, 500, "MISSING_CREDENTIALS", "Could not decrypt credentials");
    }

    const adapter = getAdapter(integration.platform);
    const forms = await adapter.listForms(creds);
    return ok(res, forms);
  } catch (error) {
    logger.error({ err: error }, `${LOG_PREFIX} listVendorForms failed:`);
    return fail(res, 502, "VENDOR_ERROR", "Failed to list vendor forms");
  }
}

export async function validateMappings(req: Request, res: Response): Promise<Response> {
  try {
    const integration = await loadIntegrationForProject(req, res);
    if (!integration) return res;

    const mappings = await crmIntegration.validateMappings(integration);
    return ok(res, mappings);
  } catch (error) {
    if (error instanceof CrmIntegrationError) {
      return fail(res, error.status, error.code, error.message);
    }
    logger.error({ err: error }, `${LOG_PREFIX} validateMappings failed:`);
    return fail(res, 500, "VALIDATE_ERROR", "Failed to validate mappings");
  }
}

export async function inferMapping(req: Request, res: Response): Promise<Response> {
  try {
    const integration = await loadIntegrationForProject(req, res);
    if (!integration) return res;

    const projectId = String(req.params.id);
    const result = await crmIntegration.inferMapping(
      projectId,
      integration,
      req.body as { website_form_name?: string; vendor_form_id?: string },
    );
    return ok(res, result);
  } catch (error) {
    if (error instanceof CrmIntegrationError) {
      return fail(res, error.status, error.code, error.message);
    }
    logger.error({ err: error }, `${LOG_PREFIX} inferMapping failed:`);
    return fail(res, 500, "INFER_ERROR", "Failed to infer field mapping");
  }
}

// ---------------------------------------------------------------------------
// Sync logs (paginated)
// ---------------------------------------------------------------------------

export async function listSyncLogs(req: Request, res: Response): Promise<Response> {
  try {
    const integration = await loadIntegrationForProject(req, res);
    if (!integration) return res;

    const limit = Math.min(parseInt(String(req.query.limit ?? "20"), 10) || 20, 200);
    const offset = Math.max(parseInt(String(req.query.offset ?? "0"), 10) || 0, 0);

    const result = await CrmSyncLogModel.findByIntegrationId(integration.id, { limit, offset });
    return res.json({
      success: true,
      data: result.data,
      pagination: { limit, offset, total: result.total },
    });
  } catch (error) {
    logger.error({ err: error }, `${LOG_PREFIX} listSyncLogs failed:`);
    return fail(res, 500, "FETCH_ERROR", "Failed to list sync logs");
  }
}

// ---------------------------------------------------------------------------
// Mappings CRUD
// ---------------------------------------------------------------------------

export async function listMappings(req: Request, res: Response): Promise<Response> {
  try {
    const integration = await loadIntegrationForProject(req, res);
    if (!integration) return res;
    const data = await IntegrationFormMappingModel.findByIntegrationId(integration.id);
    return ok(res, data);
  } catch (error) {
    logger.error({ err: error }, `${LOG_PREFIX} listMappings failed:`);
    return fail(res, 500, "FETCH_ERROR", "Failed to list mappings");
  }
}

export async function createMapping(req: Request, res: Response): Promise<Response> {
  try {
    const integration = await loadIntegrationForProject(req, res);
    if (!integration) return res;

    const {
      website_form_name,
      vendor_form_id,
      vendor_form_name,
      field_mapping,
    } = req.body as {
      website_form_name?: string;
      vendor_form_id?: string;
      vendor_form_name?: string | null;
      field_mapping?: Record<string, string>;
    };

    if (!website_form_name || !vendor_form_id) {
      return fail(
        res,
        400,
        "INVALID_INPUT",
        "website_form_name and vendor_form_id are required",
      );
    }

    const existing = await IntegrationFormMappingModel.findByIntegrationAndWebsiteForm(
      integration.id,
      website_form_name,
    );
    if (existing) {
      return fail(
        res,
        409,
        "ALREADY_MAPPED",
        "A mapping already exists for this website form",
      );
    }

    const mapping = await IntegrationFormMappingModel.create({
      integration_id: integration.id,
      website_form_name,
      vendor_form_id,
      vendor_form_name: vendor_form_name ?? null,
      field_mapping: field_mapping ?? {},
      status: "active",
    });

    return ok(res, mapping, 201);
  } catch (error) {
    logger.error({ err: error }, `${LOG_PREFIX} createMapping failed:`);
    return fail(res, 500, "CREATE_ERROR", "Failed to create mapping");
  }
}

export async function updateMapping(req: Request, res: Response): Promise<Response> {
  try {
    const integration = await loadIntegrationForProject(req, res);
    if (!integration) return res;
    const mapping = await loadMappingForIntegration(req, res, integration.id);
    if (!mapping) return res;

    const { vendor_form_id, vendor_form_name, field_mapping, status } = req.body as {
      vendor_form_id?: string;
      vendor_form_name?: string | null;
      field_mapping?: Record<string, string>;
      status?: "active" | "broken";
    };

    const updated = await IntegrationFormMappingModel.update(mapping.id, {
      vendor_form_id,
      vendor_form_name,
      field_mapping,
      status,
    });
    return ok(res, updated);
  } catch (error) {
    logger.error({ err: error }, `${LOG_PREFIX} updateMapping failed:`);
    return fail(res, 500, "UPDATE_ERROR", "Failed to update mapping");
  }
}

export async function deleteMapping(req: Request, res: Response): Promise<Response> {
  try {
    const integration = await loadIntegrationForProject(req, res);
    if (!integration) return res;
    const mapping = await loadMappingForIntegration(req, res, integration.id);
    if (!mapping) return res;
    await IntegrationFormMappingModel.deleteById(mapping.id);
    return ok(res, { deleted: true });
  } catch (error) {
    logger.error({ err: error }, `${LOG_PREFIX} deleteMapping failed:`);
    return fail(res, 500, "DELETE_ERROR", "Failed to delete mapping");
  }
}

// ---------------------------------------------------------------------------
// Data harvest (validate / logs / payload / rerun)
// ---------------------------------------------------------------------------

export async function validateHarvestIntegration(req: Request, res: Response): Promise<Response> {
  try {
    const integration = await loadIntegrationForProject(req, res);
    if (!integration) return res;

    const result = await harvestOrchestration.validateHarvestConnection(integration);
    return ok(res, result);
  } catch (error) {
    if (error instanceof HarvestOrchestrationError) {
      return fail(res, error.status, error.code, error.message);
    }
    logger.error({ err: error }, `${LOG_PREFIX} validateHarvestIntegration failed:`);
    return fail(res, 500, "VALIDATION_ERROR", "Failed to validate integration");
  }
}

export async function getHarvestLogs(req: Request, res: Response): Promise<Response> {
  try {
    const integration = await loadIntegrationForProject(req, res);
    if (!integration) return res;

    const limit = Math.min(Number(req.query.limit) || 30, 100);
    const offset = Number(req.query.offset) || 0;

    const result = await harvestOrchestration.listHarvestLogs(integration, { limit, offset });
    return ok(res, result);
  } catch (error) {
    logger.error({ err: error }, `${LOG_PREFIX} getHarvestLogs failed:`);
    return fail(res, 500, "FETCH_ERROR", "Failed to fetch harvest logs");
  }
}

export async function getHarvestLogPayload(req: Request, res: Response): Promise<Response> {
  try {
    const integration = await loadIntegrationForProject(req, res);
    if (!integration) return res;

    const logId = String(req.params.logId);
    const log = await IntegrationHarvestLogModel.findByIdForIntegration(
      logId,
      integration.id,
    );
    if (!log) {
      return fail(res, 404, "NOT_FOUND", "Harvest log not found for this integration");
    }

    const payload = await harvestLogInspector.getPayload(integration, log);
    return ok(res, payload);
  } catch (error) {
    logger.error({ err: error }, `${LOG_PREFIX} getHarvestLogPayload failed:`);
    return fail(res, 500, "FETCH_ERROR", "Failed to fetch harvest payload");
  }
}

export async function rerunHarvest(req: Request, res: Response): Promise<Response> {
  try {
    const integration = await loadIntegrationForProject(req, res);
    if (!integration) return res;

    const { harvestDate } = req.body as { harvestDate?: string };
    const result = await harvestOrchestration.rerunHarvest(integration, harvestDate);
    return ok(res, result);
  } catch (error) {
    if (error instanceof HarvestOrchestrationError) {
      return fail(res, error.status, error.code, error.message);
    }
    logger.error({ err: error }, `${LOG_PREFIX} rerunHarvest failed:`);
    return fail(res, 500, "RERUN_ERROR", "Failed to enqueue harvest rerun");
  }
}

// ---------------------------------------------------------------------------
// Clarity
// ---------------------------------------------------------------------------

export async function getClarityStatus(req: Request, res: Response): Promise<Response> {
  try {
    const projectId = String(req.params.id);
    const status = await clarityIntegration.getStatus(projectId);
    return ok(res, status);
  } catch (error) {
    return failClarityError(res, error, "Failed to fetch Clarity status");
  }
}

export async function createClarityIntegration(req: Request, res: Response): Promise<Response> {
  try {
    const projectId = String(req.params.id);
    const { projectId: clarityProjectId, apiToken, disableSnippetIds } = req.body as {
      projectId?: string;
      apiToken?: string;
      disableSnippetIds?: string[];
    };

    const result = await clarityIntegration.saveIntegration(projectId, clarityProjectId, {
      apiToken,
      connectedBy: "admin",
      disableSnippetIds: Array.isArray(disableSnippetIds) ? disableSnippetIds : [],
    });
    return ok(res, result, 201);
  } catch (error) {
    return failClarityError(res, error, "Failed to save Clarity integration");
  }
}

export async function disableClarityLegacySnippets(req: Request, res: Response): Promise<Response> {
  try {
    const projectId = String(req.params.id);
    const { snippetIds } = req.body as { snippetIds?: string[] };
    if (!Array.isArray(snippetIds) || snippetIds.length === 0) {
      return fail(res, 400, "INVALID_INPUT", "snippetIds must be a non-empty array");
    }

    const status = await clarityIntegration.disableLegacySnippets(
      projectId,
      snippetIds,
    );
    return ok(res, status);
  } catch (error) {
    return failClarityError(res, error, "Failed to disable legacy Clarity snippets");
  }
}

export async function validateClarityInstallation(req: Request, res: Response): Promise<Response> {
  try {
    const projectId = String(req.params.id);
    const result = await clarityIntegration.validateInstallation(projectId);
    return ok(res, result);
  } catch (error) {
    return failClarityError(res, error, "Failed to validate Clarity installation");
  }
}

// ---------------------------------------------------------------------------
// Rybbit
// ---------------------------------------------------------------------------

export async function getRybbitStatus(req: Request, res: Response): Promise<Response> {
  try {
    const projectId = String(req.params.id);
    const status = await rybbitIntegration.getStatus(projectId);
    return ok(res, status);
  } catch (error) {
    return failRybbitError(res, error, "Failed to fetch Rybbit status");
  }
}

export async function createRybbitIntegration(req: Request, res: Response): Promise<Response> {
  try {
    const projectId = String(req.params.id);
    const { siteId, disableSnippetIds, timeZone } = req.body as {
      siteId?: string;
      disableSnippetIds?: string[];
      timeZone?: string | null;
    };

    const result = await rybbitIntegration.saveIntegration(projectId, siteId, {
      connectedBy: "admin",
      disableSnippetIds: Array.isArray(disableSnippetIds) ? disableSnippetIds : [],
      timeZone,
    });
    return ok(res, result, 201);
  } catch (error) {
    return failRybbitError(res, error, "Failed to save Rybbit integration");
  }
}

export async function provisionRybbitPreview(req: Request, res: Response): Promise<Response> {
  try {
    const projectId = String(req.params.id);
    const result = await rybbitProvisioning.provisionPreviewAnalytics(projectId);
    return ok(res, result);
  } catch (error) {
    return failRybbitError(res, error, "Failed to provision preview analytics");
  }
}

export async function disableRybbitLegacySnippets(req: Request, res: Response): Promise<Response> {
  try {
    const projectId = String(req.params.id);
    const { snippetIds } = req.body as { snippetIds?: string[] };
    if (!Array.isArray(snippetIds) || snippetIds.length === 0) {
      return fail(res, 400, "INVALID_INPUT", "snippetIds must be a non-empty array");
    }

    const status = await rybbitIntegration.disableLegacySnippets(
      projectId,
      snippetIds,
    );
    return ok(res, status);
  } catch (error) {
    return failRybbitError(res, error, "Failed to disable legacy Rybbit snippets");
  }
}

export async function getRybbitPerformance(req: Request, res: Response): Promise<Response> {
  try {
    const integration = await loadIntegrationForProject(req, res);
    if (!integration) return res;

    if (integration.platform !== "rybbit") {
      return fail(
        res,
        400,
        "UNSUPPORTED_PLATFORM",
        "Rybbit performance is only available for Rybbit integrations",
      );
    }

    const dashboard = await rybbitPerformance.getDashboard(
      integration,
      req.query.rangeDays,
      req.query.limit,
      req.query.offset,
    );
    return ok(res, dashboard);
  } catch (error) {
    return failRybbitError(res, error, "Failed to fetch Rybbit performance");
  }
}

export async function backfillRybbitHistory(req: Request, res: Response): Promise<Response> {
  try {
    const integration = await loadIntegrationForProject(req, res);
    if (!integration) return res;

    const result = await rybbitHistory.queueHistoricBackfill(integration);
    return ok(res, result, 202);
  } catch (error) {
    return failRybbitHistoryError(res, error, "Failed to queue Rybbit historic refresh");
  }
}

export async function backfillAllRybbitHistory(_req: Request, res: Response): Promise<Response> {
  try {
    const result = await rybbitHistory.queueAllHistoricBackfills();
    return ok(res, result, 202);
  } catch (error) {
    return failRybbitHistoryError(res, error, "Failed to queue all Rybbit historic refreshes");
  }
}

// ---------------------------------------------------------------------------
// GSC (Google Search Console) — admin connect flow
// ---------------------------------------------------------------------------

export async function listGscConnections(req: Request, res: Response): Promise<Response> {
  try {
    const projectId = String(req.params.id);
    const actor = getAdminGscActor(req);
    const connections = await gscIntegration.listConnections(projectId, actor);
    return ok(res, connections);
  } catch (error) {
    return failGscError(res, error, "Failed to list GSC connections");
  }
}

export async function listGscSites(req: Request, res: Response): Promise<Response> {
  try {
    const connectionId = Number(req.query.connectionId);
    if (!connectionId) {
      return fail(res, 400, "INVALID_INPUT", "connectionId query parameter is required");
    }

    const projectId = String(req.params.id);
    const actor = getAdminGscActor(req);
    const sites = await gscIntegration.listSites(projectId, connectionId, actor);
    return ok(res, sites);
  } catch (error) {
    return failGscError(res, error, "Failed to list Search Console sites");
  }
}

export async function createGscIntegration(req: Request, res: Response): Promise<Response> {
  try {
    const projectId = String(req.params.id);
    const { connectionId, siteUrl } = req.body as {
      connectionId?: number;
      siteUrl?: string;
    };

    if (!connectionId || !siteUrl) {
      return fail(res, 400, "INVALID_INPUT", "connectionId and siteUrl are required");
    }

    const result = await gscIntegration.saveIntegration(
      projectId,
      connectionId,
      siteUrl,
      getAdminGscActor(req),
    );

    return ok(res, result, 201);
  } catch (error) {
    return failGscError(res, error, "Failed to create GSC integration");
  }
}

export async function backfillGscHistory(req: Request, res: Response): Promise<Response> {
  try {
    const integration = await loadIntegrationForProject(req, res);
    if (!integration) return res;

    const result = await gscIntegration.queueHistoricBackfill(integration);
    return ok(res, result, 202);
  } catch (error) {
    return failGscError(res, error, "Failed to queue GSC historic refresh");
  }
}

export async function getGscPerformance(req: Request, res: Response): Promise<Response> {
  try {
    const integration = await loadIntegrationForProject(req, res);
    if (!integration) return res;

    if (integration.platform !== "gsc") {
      return fail(
        res,
        400,
        "UNSUPPORTED_PLATFORM",
        "GSC performance is only available for Search Console integrations",
      );
    }

    const result = await gscPerformance.getDashboard(
      integration,
      req.query.rangeDays,
    );
    return ok(res, result);
  } catch (error) {
    logger.error({ err: error }, `${LOG_PREFIX} getGscPerformance failed:`);
    return fail(res, 500, "FETCH_ERROR", "Failed to fetch GSC performance");
  }
}

export async function getCtrOpportunities(req: Request, res: Response): Promise<Response> {
  try {
    const integration = await loadIntegrationForProject(req, res);
    if (!integration) return res;

    if (integration.platform !== "gsc") {
      return fail(
        res,
        400,
        "UNSUPPORTED_PLATFORM",
        "CTR opportunities require a Search Console integration",
      );
    }

    const dashboard = await gscPerformance.getDashboard(
      integration,
      req.query.rangeDays,
    );
    // Brick 1 of the CTR self-optimization loop: which already-ranking pages are
    // under-clicked for their position — where a sharper title wins clicks from
    // demand that already exists (the fast, existing-demand lever). Diagnosis only;
    // it stages nothing and writes nothing.
    const opportunities = findCtrOpportunities(dashboard.topPages);
    return ok(res, {
      opportunities,
      rangeDays: dashboard.rangeDays,
      fromDate: dashboard.fromDate,
      toDate: dashboard.toDate,
    });
  } catch (error) {
    logger.error({ err: error }, `${LOG_PREFIX} getCtrOpportunities failed:`);
    return fail(res, 500, "FETCH_ERROR", "Failed to compute CTR opportunities");
  }
}
