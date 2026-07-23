/**
 * Page Metadata Proposals Controller
 *
 * Thin HTTP layer for the review-and-approve flow over page title / meta-description
 * rewrites (the "brick 3" persistence half of the CTR loop). It parses input,
 * delegates to service.page-metadata-proposals, and shapes the response — no
 * business logic, no DB access (§7.3).
 *
 * It lives in its own controller (not on SeoController, already large) so the review
 * rail stays cohesive and under the size ceiling (§2.4).
 *
 * Endpoints (mounted under /api/admin/websites/:id, super-admin auth hoisted):
 *   POST /:id/seo/metadata-proposals                       stage a proposal (pending)
 *   GET  /:id/seo/metadata-proposals                       list proposals for review
 *   POST /:id/seo/metadata-proposals/:proposalId/approve   approve — stages the rewrite
 *   POST /:id/seo/metadata-proposals/:proposalId/reject    reject
 *
 * Approve/reject STAGE a decision only. Publishing the approved metadata to the live
 * page is a separate, already-gated step and is not driven from here.
 */

import { Request, Response } from "express";
import type { RBACRequest } from "../../middleware/rbac";
import type { PageMetadataProposalStatus } from "../../models/website-builder/PageMetadataProposalModel";
import * as proposals from "./feature-services/service.page-metadata-proposals";
import { PageMetadataProposalError } from "./feature-services/service.page-metadata-proposals";
import { failPageMetadataProposalError } from "./feature-utils/util.page-metadata-proposal-responses";
import { ok } from "./feature-utils/util.integration-responses";

/** The authenticated super-admin acting as the reviewer (§5.4 — server-derived). */
function reviewerId(req: Request): number {
  const userId = (req as RBACRequest).userId;
  if (!userId) {
    throw new PageMetadataProposalError(
      401,
      "AUTH_REQUIRED",
      "Authentication is required to review metadata proposals.",
    );
  }
  return userId;
}

interface StageProposalBody {
  pageId: string;
  proposedTitle: string;
  proposedDescription: string;
  rationale: Record<string, unknown>;
}

/**
 * POST /:id/seo/metadata-proposals
 * Body is validated at the route boundary (§11.2), so it is trusted here.
 */
export async function stageProposal(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const body = req.body as StageProposalBody;
    const proposal = await proposals.stageProposal({
      projectId: req.params.id,
      pageId: body.pageId,
      proposedTitle: body.proposedTitle,
      proposedDescription: body.proposedDescription,
      rationale: body.rationale,
    });
    return ok(res, proposal, 201);
  } catch (error) {
    return failPageMetadataProposalError(res, error, "Failed to stage metadata proposal");
  }
}

/** GET /:id/seo/metadata-proposals?status=pending|approved|rejected */
export async function listProposals(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const status = req.query.status as PageMetadataProposalStatus | undefined;
    const list = await proposals.listProposals(req.params.id, status);
    return ok(res, list);
  } catch (error) {
    return failPageMetadataProposalError(res, error, "Failed to list metadata proposals");
  }
}

/** POST /:id/seo/metadata-proposals/:proposalId/approve — stages the rewrite. */
export async function approveProposal(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const proposal = await proposals.approveProposal({
      projectId: req.params.id,
      proposalId: req.params.proposalId,
      reviewedBy: reviewerId(req),
    });
    return ok(res, proposal);
  } catch (error) {
    return failPageMetadataProposalError(res, error, "Failed to approve metadata proposal");
  }
}

/** POST /:id/seo/metadata-proposals/:proposalId/reject */
export async function rejectProposal(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const proposal = await proposals.rejectProposal({
      projectId: req.params.id,
      proposalId: req.params.proposalId,
      reviewedBy: reviewerId(req),
    });
    return ok(res, proposal);
  } catch (error) {
    return failPageMetadataProposalError(res, error, "Failed to reject metadata proposal");
  }
}
