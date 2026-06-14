/**
 * ClarityController — thin request/response layer.
 * All business logic is delegated to feature-services.
 */
import { Request, Response } from "express";
import { domainMappings } from "../../utils/core/domainMappings";
import { findMappingByClientId } from "./feature-utils/util.clarity-domain-mapping";
import { fetchClarityLiveInsights } from "./feature-services/service.clarity-api";
import {
  storeData,
  getKeyDataForClient,
  getAIReadyDataForClient,
} from "./feature-services/service.clarity-data";

/**
 * GET /clarity/diag/projects
 * Returns all domain mappings for diagnostics.
 *
 * Strips clarity_apiToken before responding — secrets must never leave the
 * server via a diagnostics endpoint. (The tokens have been removed from source
 * entirely; this is defense-in-depth in case the field is ever repopulated.)
 */
export const getDiagProjects = (_req: Request, res: Response) => {
  const sanitized = domainMappings.map(({ clarity_apiToken, ...rest }) => {
    void clarity_apiToken; // intentionally dropped from the response
    return rest;
  });
  return res.json(sanitized);
};

/**
 * POST /clarity/fetch
 * Fetches Clarity live insights and stores the result.
 */
export const fetch = async (req: Request, res: Response) => {
  try {
    const { clientId, numOfDays = 1, dimensions } = req.body || {};
    if (!clientId) {
      return res.status(400).json({ error: "Missing clientId" });
    }
    if (![1, 2, 3].includes(numOfDays)) {
      return res
        .status(400)
        .json({ error: "numOfDays must be 1, 2, or 3 (Clarity API limit)" });
    }

    const mapping = findMappingByClientId(clientId);
    if (!mapping?.clarity_projectId) {
      return res.status(404).json({ error: "No mapping found for clientId" });
    }

    console.log(
      `📡 Fetching Clarity data for ${mapping.domain} (projectId=${mapping.clarity_projectId})`
    );

    const rawData = await fetchClarityLiveInsights(
      mapping.clarity_projectId,
      numOfDays as 1 | 2 | 3,
      dimensions
    );

    const today = new Date().toISOString().split("T")[0];
    await storeData(mapping.domain, today, rawData);

    return res.json({
      success: true,
      domain: mapping.domain,
      report_date: today,
      data: rawData,
      message: "Clarity data fetched and stored successfully",
    });
  } catch (err: any) {
    console.error("❌ Error in /clarity/fetch:", err?.message || err);
    return res
      .status(500)
      .json({ error: `Failed to fetch Clarity data: ${err.message}` });
  }
};

/**
 * POST /clarity/getKeyData
 * Returns aggregated key metrics with trend score.
 */
export const getKeyData = async (req: Request, res: Response) => {
  try {
    const { clientId } = req.body || {};
    if (!clientId) {
      return res.status(400).json({ error: "Missing clientId" });
    }

    const result = await getKeyDataForClient(clientId);
    return res.json(result);
  } catch (err: any) {
    console.error("❌ Error in /clarity/getKeyData:", err?.message || err);
    return res
      .status(500)
      .json({ error: `Failed to get Clarity key data: ${err.message}` });
  }
};

/**
 * POST /clarity/getAIReadyData
 * Returns daily Clarity data for AI processing.
 */
export const getAIReadyData = async (req: Request, res: Response) => {
  try {
    const { clientId } = req.body || {};
    if (!clientId) {
      return res.status(400).json({ error: "Missing clientId" });
    }

    const result = await getAIReadyDataForClient(clientId);
    return res.json({
      success: true,
      ...result,
    });
  } catch (err: any) {
    console.error("❌ Error in /clarity/getAIReadyData:", err?.message || err);
    return res
      .status(500)
      .json({ error: `Failed to get Clarity AI Ready data: ${err.message}` });
  }
};
