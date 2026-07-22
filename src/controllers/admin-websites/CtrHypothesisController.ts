/**
 * CTR Hypothesis Controller
 *
 * Thin HTTP layer for the educated-hypothesis rewrite (brick 2 of the CTR
 * self-optimization loop). It parses input, delegates to the feature-service,
 * and shapes the response — no business logic, no DB access (§7.3).
 *
 * It lives in its own controller rather than on WebsiteIntegrationsController
 * because that file is already at 745 lines and the CTR-diagnosis endpoint is
 * landing there too; adding this handler as well would push it past the ~800-line
 * ceiling (§2.4).
 *
 * The endpoint takes a diagnosed CTR opportunity in the request body, so the
 * engine stays decoupled from the diagnosis brick while still having a real
 * consumer. Once the diagnosis brick merges, a follow-up wires
 * findCtrOpportunities() straight into this service.
 *
 * Endpoints (mounted under /api/admin/websites/:id):
 *   POST /:id/seo/ctr-hypothesis    propose a metadata rewrite for one opportunity
 */

import { Request, Response } from "express";
import * as ctrHypothesis from "./feature-services/service.ctr-hypothesis";
import { failCtrHypothesisError } from "./feature-utils/util.ctr-hypothesis-responses";
import { ok } from "./feature-utils/util.integration-responses";

/**
 * POST /:id/seo/ctr-hypothesis
 *
 * Body is validated at the route boundary (§11.2) by ctrHypothesisBodySchema in
 * enforce mode, so it is trusted here. Returns either a proposal or an honest
 * skip; it writes nothing and sends nothing.
 */
export async function proposeCtrHypothesis(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const body = req.body as ctrHypothesis.CtrHypothesisRequest;
    const result = await ctrHypothesis.generateCtrHypothesis({
      ...body,
      projectId: req.params.id,
    });

    return ok(res, result);
  } catch (error) {
    return failCtrHypothesisError(res, error, "Failed to generate CTR hypothesis");
  }
}
