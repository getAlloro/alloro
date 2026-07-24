import { Response } from "express";
import { RBACRequest } from "../../middleware/rbac";
import { getResolvedVocabulary } from "../../services/vocabularyAutoMapper";
import { ok, handleVocabularyError } from "./feature-utils/controllerResponses";

/**
 * Thin vocabulary controller — orchestrates the read service and shapes the
 * response. No business logic, no DB access (§7.3). Mirrors the reference
 * controller shape in controllers/gbp-automation/ (§6.1).
 */

/**
 * GET /api/vocabulary
 *
 * Return the authenticated org's resolved vocabulary preset — how Alloro should
 * speak to this owner (patient vs. client vs. customer, referral term, primary
 * metric, …). The preset is populated by the auto-mapper when the org's GBP
 * category lands. When nothing has been configured yet, `configured` is false.
 *
 * Tenant scope (§5.5/§11.7): the organization is taken from server-side auth
 * context (req.organizationId), never from client input.
 */
export async function getVocabulary(
  req: RBACRequest,
  res: Response
): Promise<Response> {
  try {
    const organizationId = req.organizationId;

    // No org on the session yet — nothing is scoped to read; report unconfigured
    // rather than querying without a tenant.
    if (!organizationId) {
      return ok(res, { configured: false, vertical: null, preset: null });
    }

    const preset = await getResolvedVocabulary(organizationId);

    return ok(res, {
      configured: preset !== null,
      vertical: preset?.vertical ?? null,
      preset,
    });
  } catch (error) {
    return handleVocabularyError(res, error);
  }
}
