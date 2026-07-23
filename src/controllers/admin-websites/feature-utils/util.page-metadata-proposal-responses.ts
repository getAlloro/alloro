/**
 * Page metadata proposals — typed-error → HTTP response mapper.
 *
 * Mirrors the platform error-mappers in util.integration-responses (§8.3): a thrown
 * PageMetadataProposalError carries its own status/code, so it maps straight to a
 * fail() response; anything unrecognized is logged and falls back to a 500 with a
 * generic message (§3.4 — no internal detail leaks to the client).
 */

import type { Response } from "express";
import logger from "../../../lib/logger";
import { PageMetadataProposalError } from "../feature-services/service.page-metadata-proposals";
import { fail } from "./util.integration-responses";

export const LOG_PREFIX = "[Page Metadata Proposals]";

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
