/**
 * Page metadata proposals — response builders + typed-error → HTTP mapper.
 *
 * These four endpoints emit the canonical contract (§8.1), copied from the
 * certified-clean reference
 * controllers/gbp-automation/feature-utils/controllerResponses.ts (§6.1, §8.2):
 *
 *   success → { success: true, data, error: null }
 *   failure → { success: false, data: null, error: { code, message, details } }
 *
 * DELIBERATE DIVERGENCE FROM THE SIBLING HELPER. The rest of this domain uses
 * `util.integration-responses`, whose `ok()` omits `error: null` and whose
 * `fail()` emits `error` as a bare string alongside a sibling `message` — a
 * shape §8.1 does not permit. That drift pre-dates this work, and its existing
 * consumers (WebsiteIntegrationsController plus the frontend paths that read
 * `error` as a string) are outside this change's blast radius, so it is left
 * alone rather than migrated here. These endpoints are new and have no clients,
 * so they ship on the correct contract from the start. Do not "align" them back
 * to the string shape; migrate the older endpoints forward instead.
 */

import type { Response } from "express";
import logger from "../../../lib/logger";
import { PageMetadataProposalError } from "../feature-services/service.page-metadata-proposals";

export const LOG_PREFIX = "[Page Metadata Proposals]";

export function ok(res: Response, data: unknown, status = 200): Response {
  return res.status(status).json({ success: true, data, error: null });
}

function fail(
  res: Response,
  status: number,
  code: string,
  message: string,
  details: unknown = null,
): Response {
  return res.status(status).json({
    success: false,
    data: null,
    error: { code, message, details },
  });
}

/**
 * A thrown PageMetadataProposalError carries its own status and machine code, so
 * it maps straight to a fail() response. Anything unrecognized is logged and
 * falls back to a generic 500 — the failure reaches the operator (§3.2) and no
 * internal detail reaches the client (§3.4).
 */
export function failPageMetadataProposalError(
  res: Response,
  error: unknown,
  fallbackMessage: string,
): Response {
  if (error instanceof PageMetadataProposalError) {
    return fail(res, error.status, error.code, error.message);
  }

  logger.error({ err: error }, `${LOG_PREFIX} ${fallbackMessage}:`);
  return fail(res, 500, "PAGE_METADATA_PROPOSAL_ERROR", fallbackMessage);
}
