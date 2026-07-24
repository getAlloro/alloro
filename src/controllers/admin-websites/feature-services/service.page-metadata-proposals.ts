/**
 * Page metadata proposals service — the persistence + review half ("brick 3") of
 * the CTR self-optimization loop.
 *
 * service.ctr-hypothesis PRODUCES a title / meta-description rewrite proposal but
 * persists nothing. This service is where an owner-facing decision lives: it stages
 * a produced proposal as a `pending` row, lists proposals so a reviewer sees
 * current-vs-suggested with the plain rationale, and records an approve (which
 * STAGES the rewrite) or a reject.
 *
 * SCOPE — this service decides and stages; it does NOT publish. Writing an approved
 * title/description onto the live page's `seo_data` is a SEPARATE, already-gated
 * step (the existing SEO write path). Nothing here touches a live page, so an
 * approval cannot change what a visitor sees until that separate step runs.
 *
 * Value #6: a proposal is framed as improving how the page is DESCRIBED in search —
 * never as a ranking promise. The honest rationale/prediction come straight from the
 * CTR-hypothesis producer and are stored verbatim.
 *
 * Tenant scope (§5.5/§11.7): every path is scoped by `projectId`, and the model
 * requires it on every query. The page is re-read server-side through
 * PageModel.findByIdAndProject, so a caller cannot stage a proposal against a page
 * outside the project it named.
 */

import { PageModel } from "../../../models/website-builder/PageModel";
import {
  IPageMetadataProposal,
  PageMetadataProposalModel,
  PageMetadataProposalStatus,
} from "../../../models/website-builder/PageMetadataProposalModel";

/** Typed domain error — status mapping is centralized in the response helper (§8.3). */
export class PageMetadataProposalError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "PageMetadataProposalError";
  }
}

/**
 * The producer's rewrite, adapted into the fields this service persists. `rationale`
 * is the CTR-hypothesis evidence blob (rationale + prediction + diagnosed
 * opportunity) stored verbatim so the "why" survives with the row.
 */
export interface StageProposalInput {
  projectId: string;
  pageId: string;
  proposedTitle: string;
  proposedDescription: string;
  rationale: Record<string, unknown>;
}

interface ReviewProposalInput {
  projectId: string;
  proposalId: string;
  reviewedBy: number;
}

function readMetaString(
  seoData: Record<string, unknown> | null,
  key: "meta_title" | "meta_description",
): string | null {
  const value = seoData?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

/**
 * Stage a produced rewrite as a `pending` proposal for review.
 *
 * The before-state is read from the page's LIVE `seo_data` server-side (§5.4), not
 * trusted from the caller, so the review always shows the real current metadata.
 */
export async function stageProposal(
  input: StageProposalInput,
): Promise<IPageMetadataProposal> {
  const proposedTitle = input.proposedTitle.trim();
  const proposedDescription = input.proposedDescription.trim();
  if (!proposedTitle || !proposedDescription) {
    throw new PageMetadataProposalError(
      400,
      "EMPTY_PROPOSAL",
      "A proposal needs both a proposed title and a proposed description.",
    );
  }

  const page = await PageModel.findByIdAndProject(input.pageId, input.projectId);
  if (!page) {
    throw new PageMetadataProposalError(
      404,
      "PAGE_NOT_FOUND",
      "No page with that id exists in this project.",
    );
  }

  return PageMetadataProposalModel.createProposal({
    project_id: input.projectId,
    page_id: page.id,
    page_path: page.path,
    before_title: readMetaString(page.seo_data, "meta_title"),
    before_description: readMetaString(page.seo_data, "meta_description"),
    proposed_title: proposedTitle,
    proposed_description: proposedDescription,
    rationale: input.rationale,
  });
}

/** List a project's proposals (newest first), optionally narrowed by status. */
export async function listProposals(
  projectId: string,
  status?: PageMetadataProposalStatus,
): Promise<IPageMetadataProposal[]> {
  return PageMetadataProposalModel.listForProject(
    projectId,
    status ? { status } : undefined,
  );
}

/**
 * Approve a pending proposal — STAGES the rewrite. Idempotent by construction: the
 * model's `pending` guard means a second approve (or an approve after a reject)
 * finds no row and surfaces a 409, never silently re-approving.
 */
export async function approveProposal(
  input: ReviewProposalInput,
): Promise<IPageMetadataProposal> {
  return transitionProposal(input, "approved");
}

/** Reject a pending proposal. Same idempotent guard as approve. */
export async function rejectProposal(
  input: ReviewProposalInput,
): Promise<IPageMetadataProposal> {
  return transitionProposal(input, "rejected");
}

async function transitionProposal(
  input: ReviewProposalInput,
  status: Extract<PageMetadataProposalStatus, "approved" | "rejected">,
): Promise<IPageMetadataProposal> {
  const existing = await PageMetadataProposalModel.findByIdForProject(
    input.proposalId,
    input.projectId,
  );
  if (!existing) {
    throw new PageMetadataProposalError(
      404,
      "PROPOSAL_NOT_FOUND",
      "No proposal with that id exists in this project.",
    );
  }

  const updated = await PageMetadataProposalModel.setReviewStatusForProject(
    input.proposalId,
    input.projectId,
    status,
    input.reviewedBy,
  );
  if (!updated) {
    // The row exists but is no longer pending — it was already reviewed.
    throw new PageMetadataProposalError(
      409,
      "PROPOSAL_ALREADY_REVIEWED",
      `This proposal was already ${existing.status}; only a pending proposal can be ${status}.`,
    );
  }

  return updated;
}
