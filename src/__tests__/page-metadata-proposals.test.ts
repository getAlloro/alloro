/**
 * Page metadata proposals service tests.
 *
 * Proves the review-and-approve rail without a live DB (the shared knex `db` is
 * mocked; the two model statics are spied):
 *
 *   1. Staging reads the before-state from the page's LIVE seo_data server-side
 *      (§5.4) and persists a pending proposal with the right shape; a blank rewrite
 *      is refused (EMPTY_PROPOSAL), and a page outside the named project is a
 *      tenant-scoped PAGE_NOT_FOUND (§5.5/§11.7).
 *   2. Listing is scoped by project and passes the status filter straight through.
 *   3. Approve/reject move a pending proposal to its terminal status; a missing row
 *      is PROPOSAL_NOT_FOUND, and a row that is no longer pending is a 409
 *      PROPOSAL_ALREADY_REVIEWED — the transition is idempotent, never a silent
 *      re-approve. Neither path writes to a live page (publishing is out of scope).
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { mockDb } from "./helpers/db";

vi.mock("../database/connection", () => mockDb());

import * as proposals from "../controllers/admin-websites/feature-services/service.page-metadata-proposals";
import { PageMetadataProposalError } from "../controllers/admin-websites/feature-services/service.page-metadata-proposals";
import { PageModel } from "../models/website-builder/PageModel";
import {
  IPageMetadataProposal,
  PageMetadataProposalModel,
} from "../models/website-builder/PageMetadataProposalModel";

afterEach(() => {
  vi.restoreAllMocks();
});

const PROJECT_ID = "11111111-1111-1111-1111-111111111111";
const PAGE_ID = "22222222-2222-2222-2222-222222222222";
const PROPOSAL_ID = "33333333-3333-3333-3333-333333333333";
const REVIEWER_ID = 7;

const RATIONALE = { summary: "Designed to describe the page more clearly in search." };

function fakePage(seoData: Record<string, unknown> | null) {
  return { id: PAGE_ID, project_id: PROJECT_ID, path: "/implants", seo_data: seoData };
}

function fakeProposal(overrides: Partial<IPageMetadataProposal> = {}): IPageMetadataProposal {
  return {
    id: PROPOSAL_ID,
    project_id: PROJECT_ID,
    page_id: PAGE_ID,
    page_path: "/implants",
    before_title: "Old title",
    before_description: "Old description",
    proposed_title: "Dental Implants in Fairfax | Same-Week Consults",
    proposed_description: "Book a dental-implant consult in Fairfax this week.",
    rationale: RATIONALE,
    status: "pending",
    reviewed_by: null,
    reviewed_at: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

describe("stageProposal", () => {
  it("captures the live before-state and stages a pending proposal", async () => {
    vi.spyOn(PageModel, "findByIdAndProject").mockResolvedValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fakePage({ meta_title: "Old title", meta_description: "Old description" }) as any,
    );
    const created = vi
      .spyOn(PageMetadataProposalModel, "createProposal")
      .mockResolvedValue(fakeProposal());

    await proposals.stageProposal({
      projectId: PROJECT_ID,
      pageId: PAGE_ID,
      proposedTitle: "Dental Implants in Fairfax | Same-Week Consults",
      proposedDescription: "Book a dental-implant consult in Fairfax this week.",
      rationale: RATIONALE,
    });

    // §5.4 — before-state comes from the page's live seo_data, not the caller.
    expect(created).toHaveBeenCalledWith(
      expect.objectContaining({
        project_id: PROJECT_ID,
        page_id: PAGE_ID,
        page_path: "/implants",
        before_title: "Old title",
        before_description: "Old description",
        proposed_title: "Dental Implants in Fairfax | Same-Week Consults",
        rationale: RATIONALE,
      }),
    );
  });

  it("stores null before-state when the page has no current metadata", async () => {
    vi.spyOn(PageModel, "findByIdAndProject").mockResolvedValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fakePage(null) as any,
    );
    const created = vi
      .spyOn(PageMetadataProposalModel, "createProposal")
      .mockResolvedValue(fakeProposal({ before_title: null, before_description: null }));

    await proposals.stageProposal({
      projectId: PROJECT_ID,
      pageId: PAGE_ID,
      proposedTitle: "A title",
      proposedDescription: "A description",
      rationale: RATIONALE,
    });

    expect(created).toHaveBeenCalledWith(
      expect.objectContaining({ before_title: null, before_description: null }),
    );
  });

  it("refuses a blank rewrite before touching the DB (EMPTY_PROPOSAL)", async () => {
    const findPage = vi.spyOn(PageModel, "findByIdAndProject");
    const create = vi.spyOn(PageMetadataProposalModel, "createProposal");

    await expect(
      proposals.stageProposal({
        projectId: PROJECT_ID,
        pageId: PAGE_ID,
        proposedTitle: "   ",
        proposedDescription: "A description",
        rationale: RATIONALE,
      }),
    ).rejects.toMatchObject({ code: "EMPTY_PROPOSAL", status: 400 });

    expect(findPage).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects a page outside the named project (tenant scope §11.7)", async () => {
    vi.spyOn(PageModel, "findByIdAndProject").mockResolvedValue(undefined);
    const create = vi.spyOn(PageMetadataProposalModel, "createProposal");

    await expect(
      proposals.stageProposal({
        projectId: PROJECT_ID,
        pageId: PAGE_ID,
        proposedTitle: "A title",
        proposedDescription: "A description",
        rationale: RATIONALE,
      }),
    ).rejects.toMatchObject({ code: "PAGE_NOT_FOUND", status: 404 });

    expect(create).not.toHaveBeenCalled();
  });
});

describe("listProposals", () => {
  it("scopes to the project and passes the status filter through", async () => {
    const list = vi
      .spyOn(PageMetadataProposalModel, "listForProject")
      .mockResolvedValue([fakeProposal()]);

    await proposals.listProposals(PROJECT_ID, "pending");

    expect(list).toHaveBeenCalledWith(PROJECT_ID, { status: "pending" });
  });

  it("omits the filter when no status is given", async () => {
    const list = vi
      .spyOn(PageMetadataProposalModel, "listForProject")
      .mockResolvedValue([]);

    await proposals.listProposals(PROJECT_ID);

    expect(list).toHaveBeenCalledWith(PROJECT_ID, undefined);
  });
});

describe("approveProposal / rejectProposal", () => {
  it("approves a pending proposal and records the reviewer", async () => {
    vi.spyOn(PageMetadataProposalModel, "findByIdForProject").mockResolvedValue(
      fakeProposal(),
    );
    const setStatus = vi
      .spyOn(PageMetadataProposalModel, "setReviewStatusForProject")
      .mockResolvedValue(fakeProposal({ status: "approved", reviewed_by: REVIEWER_ID }));

    const result = await proposals.approveProposal({
      projectId: PROJECT_ID,
      proposalId: PROPOSAL_ID,
      reviewedBy: REVIEWER_ID,
    });

    expect(setStatus).toHaveBeenCalledWith(PROPOSAL_ID, PROJECT_ID, "approved", REVIEWER_ID);
    expect(result.status).toBe("approved");
  });

  it("rejects a pending proposal", async () => {
    vi.spyOn(PageMetadataProposalModel, "findByIdForProject").mockResolvedValue(
      fakeProposal(),
    );
    vi.spyOn(PageMetadataProposalModel, "setReviewStatusForProject").mockResolvedValue(
      fakeProposal({ status: "rejected", reviewed_by: REVIEWER_ID }),
    );

    const result = await proposals.rejectProposal({
      projectId: PROJECT_ID,
      proposalId: PROPOSAL_ID,
      reviewedBy: REVIEWER_ID,
    });

    expect(result.status).toBe("rejected");
  });

  it("is PROPOSAL_NOT_FOUND when the row is absent or out-of-scope", async () => {
    vi.spyOn(PageMetadataProposalModel, "findByIdForProject").mockResolvedValue(undefined);
    const setStatus = vi.spyOn(PageMetadataProposalModel, "setReviewStatusForProject");

    await expect(
      proposals.approveProposal({
        projectId: PROJECT_ID,
        proposalId: PROPOSAL_ID,
        reviewedBy: REVIEWER_ID,
      }),
    ).rejects.toMatchObject({ code: "PROPOSAL_NOT_FOUND", status: 404 });

    expect(setStatus).not.toHaveBeenCalled();
  });

  it("is a 409 PROPOSAL_ALREADY_REVIEWED when the row is no longer pending", async () => {
    // The row exists but the guarded update matches nothing → undefined.
    vi.spyOn(PageMetadataProposalModel, "findByIdForProject").mockResolvedValue(
      fakeProposal({ status: "approved" }),
    );
    vi.spyOn(PageMetadataProposalModel, "setReviewStatusForProject").mockResolvedValue(
      undefined,
    );

    await expect(
      proposals.approveProposal({
        projectId: PROJECT_ID,
        proposalId: PROPOSAL_ID,
        reviewedBy: REVIEWER_ID,
      }),
    ).rejects.toMatchObject({ code: "PROPOSAL_ALREADY_REVIEWED", status: 409 });
  });

  it("exposes the typed error class for the response mapper", () => {
    const err = new PageMetadataProposalError(404, "PROPOSAL_NOT_FOUND", "nope");
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(404);
  });
});
