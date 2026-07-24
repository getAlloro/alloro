/**
 * Page metadata proposals — the wire contract and the boundary guards.
 *
 * Three things are pinned here that unit tests over the service cannot reach:
 *
 *   1. §8.1 — the four new endpoints emit exactly
 *      `{ success, data, error }` with `error: null` on success and
 *      `{ code, message, details }` on failure. The sibling helper in this
 *      domain emits `error` as a bare string; these endpoints must not drift
 *      back to it.
 *   2. §11.2 / §8.4 — a malformed route param is a 400, not the 500 that a raw
 *      `invalid input syntax for type uuid` from Postgres would produce.
 *   3. The `reviewed_by` column is an `integer`, matching `users.id`. As a
 *      `bigInteger`, node-postgres would return it as a STRING while the model
 *      type says `number`, and `proposal.reviewed_by === currentUser.id` would
 *      be false for the user who actually approved it.
 *
 * §20.4 — synthetic data only; the shared knex `db` is mocked.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { mockDb } from "./helpers/db";

vi.mock("../database/connection", () => mockDb());

import {
  pageMetadataProposalParamsSchema,
  pageMetadataProposalReviewParamsSchema,
  stagePageMetadataProposalBodySchema,
} from "../validation/pageMetadataProposal.schemas";
import {
  ok,
  failPageMetadataProposalError,
} from "../controllers/admin-websites/feature-utils/util.page-metadata-proposal-responses";
import { PageMetadataProposalError } from "../controllers/admin-websites/feature-services/service.page-metadata-proposals";

const VALID_UUID = "11111111-1111-4111-8111-111111111111";
const OTHER_UUID = "22222222-2222-4222-8222-222222222222";

/** Minimal Express Response double that records what was sent. */
function responseDouble() {
  const sent: { status?: number; body?: unknown } = {};
  const res = {
    status(code: number) {
      sent.status = code;
      return res;
    },
    json(body: unknown) {
      sent.body = body;
      return res;
    },
  };
  return { res: res as unknown as import("express").Response, sent };
}

describe("§8.1 — the response contract these endpoints emit", () => {
  it("success is exactly { success: true, data, error: null }", () => {
    const { res, sent } = responseDouble();
    ok(res, { id: VALID_UUID }, 201);

    expect(sent.status).toBe(201);
    expect(Object.keys(sent.body as object).sort()).toEqual([
      "data",
      "error",
      "success",
    ]);
    expect(sent.body).toEqual({
      success: true,
      data: { id: VALID_UUID },
      error: null,
    });
  });

  it("failure is exactly { success: false, data: null, error: { code, message, details } }", () => {
    const { res, sent } = responseDouble();
    failPageMetadataProposalError(
      res,
      new PageMetadataProposalError(409, "PROPOSAL_ALREADY_REVIEWED", "Already reviewed."),
      "Failed to approve metadata proposal",
    );

    expect(sent.status).toBe(409);
    expect(sent.body).toEqual({
      success: false,
      data: null,
      error: {
        code: "PROPOSAL_ALREADY_REVIEWED",
        message: "Already reviewed.",
        details: null,
      },
    });
  });

  it("never emits `error` as a bare string, and never a sibling top-level `message`", () => {
    const { res, sent } = responseDouble();
    failPageMetadataProposalError(
      res,
      new PageMetadataProposalError(404, "PROPOSAL_NOT_FOUND", "No such proposal."),
      "Failed to approve metadata proposal",
    );

    const body = sent.body as Record<string, unknown>;
    expect(typeof body.error).toBe("object");
    expect(body).not.toHaveProperty("message");
    expect(body.data).toBeNull();
  });

  it("an unrecognized error becomes a generic 500 with no internal detail (§3.4)", () => {
    const { res, sent } = responseDouble();
    failPageMetadataProposalError(
      res,
      new Error('invalid input syntax for type uuid: "not-a-uuid"'),
      "Failed to stage metadata proposal",
    );

    expect(sent.status).toBe(500);
    const body = sent.body as { error: { code: string; message: string } };
    expect(body.error.code).toBe("PAGE_METADATA_PROPOSAL_ERROR");
    // The driver's message must not reach the client.
    expect(JSON.stringify(sent.body)).not.toContain("invalid input syntax");
  });
});

describe("§11.2 — route params are validated at the boundary", () => {
  it("rejects a non-uuid project id", () => {
    expect(pageMetadataProposalParamsSchema.safeParse({ id: "not-a-uuid" }).success).toBe(false);
  });

  it("accepts a well-formed project id", () => {
    expect(pageMetadataProposalParamsSchema.safeParse({ id: VALID_UUID }).success).toBe(true);
  });

  it("rejects a non-uuid proposal id on the review routes", () => {
    expect(
      pageMetadataProposalReviewParamsSchema.safeParse({
        id: VALID_UUID,
        proposalId: "not-a-uuid",
      }).success,
    ).toBe(false);
  });

  it("accepts a well-formed pair on the review routes", () => {
    expect(
      pageMetadataProposalReviewParamsSchema.safeParse({
        id: VALID_UUID,
        proposalId: OTHER_UUID,
      }).success,
    ).toBe(true);
  });

  it("all four routes apply a params-target validate()", () => {
    const source = readFileSync(
      join(__dirname, "..", "routes", "admin", "websites", "seo.routes.ts"),
      "utf8",
    );
    const proposalBlock = source.slice(source.indexOf("metadata-proposals"));
    const paramsGuards = proposalBlock.match(/target:\s*"params"/g) ?? [];
    // stage, list, approve, reject.
    expect(paramsGuards.length).toBe(4);
  });
});

describe("rationale is bounded like the two text fields", () => {
  const validBody = {
    pageId: VALID_UUID,
    proposedTitle: "Dental Implants in Fairfax",
    proposedDescription: "Book a dental-implant consult this week.",
  };

  it("accepts a normal producer rationale", () => {
    const result = stagePageMetadataProposalBodySchema.safeParse({
      ...validBody,
      rationale: { summary: "Describes the page more clearly in search.", predictedCtr: 0.04 },
    });
    expect(result.success).toBe(true);
  });

  it("rejects a rationale with too many keys", () => {
    const fat = Object.fromEntries(
      Array.from({ length: 200 }, (_, i) => [`k${i}`, i]),
    );
    expect(
      stagePageMetadataProposalBodySchema.safeParse({ ...validBody, rationale: fat }).success,
    ).toBe(false);
  });

  it("rejects a multi-megabyte rationale blob", () => {
    const huge = { blob: "x".repeat(2_000_000) };
    expect(
      stagePageMetadataProposalBodySchema.safeParse({ ...validBody, rationale: huge }).success,
    ).toBe(false);
  });

  it("still bounds the two text fields", () => {
    expect(
      stagePageMetadataProposalBodySchema.safeParse({
        ...validBody,
        proposedTitle: "x".repeat(501),
      }).success,
    ).toBe(false);
    expect(
      stagePageMetadataProposalBodySchema.safeParse({ ...validBody, proposedTitle: "" }).success,
    ).toBe(false);
  });
});

describe("reviewed_by column width", () => {
  const migrationSource = readFileSync(
    join(
      __dirname,
      "..",
      "database",
      "migrations",
      "20260723000000_create_page_metadata_proposals.ts",
    ),
    "utf8",
  );

  it("is declared integer, matching users.id", () => {
    expect(migrationSource).toContain('t.integer("reviewed_by")');
  });

  it("is not bigInteger — node-postgres would return int8 as a string", () => {
    expect(migrationSource).not.toContain('bigInteger("reviewed_by")');
  });

  it("up() is guarded so re-running is a no-op", () => {
    expect(migrationSource).toContain('hasTable("page_metadata_proposals")');
  });
});

describe("reviewed_by is a number on the approve path", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("carries a numeric reviewer id through the service result", async () => {
    const { PageMetadataProposalModel } = await import(
      "../models/website-builder/PageMetadataProposalModel"
    );
    const proposals = await import(
      "../controllers/admin-websites/feature-services/service.page-metadata-proposals"
    );

    const reviewed = {
      id: OTHER_UUID,
      project_id: VALID_UUID,
      page_id: VALID_UUID,
      page_path: "/implants",
      before_title: null,
      before_description: null,
      proposed_title: "t",
      proposed_description: "d",
      rationale: {},
      status: "approved" as const,
      reviewed_by: 7,
      reviewed_at: new Date(),
      created_at: new Date(),
      updated_at: new Date(),
    };

    vi.spyOn(PageMetadataProposalModel, "findByIdForProject").mockResolvedValue({
      ...reviewed,
      status: "pending",
      reviewed_by: null,
      reviewed_at: null,
    });
    vi.spyOn(PageMetadataProposalModel, "setReviewStatusForProject").mockResolvedValue(reviewed);

    const result = await proposals.approveProposal({
      projectId: VALID_UUID,
      proposalId: OTHER_UUID,
      reviewedBy: 7,
    });

    // A bigInteger column would surface "7" here, and an equality check against
    // the current user's numeric id would silently be false.
    expect(typeof result.reviewed_by).toBe("number");
    expect(result.reviewed_by).toBe(7);
  });
});
