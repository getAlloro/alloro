/**
 * Hermetic tests — Admin OS related-links endpoints (P4 T4,
 * plans/07042026-alloro-os-admin-port; analog: os-documents.test.ts). Every
 * Os*Model is mocked at the seam so the REAL routes → validation → controller →
 * OsLinkService run with no DB. The link lifecycle itself is proven against
 * live Postgres in src/integration-tests/os/p4-rag.itest.ts.
 *
 * Covers: GET buckets (accepted/backlinks/suggested), POST manual create (201)
 * incl. the 409 duplicate + 400 self-link + 404 target-missing paths, PATCH
 * accept/reject, and the §11.1 auth guards.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { z } from "zod";

vi.mock("../models/OsDocumentModel", () => ({
  OsDocumentModel: {
    findDocumentById: vi.fn(),
  },
}));
vi.mock("../models/OsDocumentLinkModel", () => ({
  OsDocumentLinkModel: {
    listOutboundAccepted: vi.fn(async () => []),
    listInboundAccepted: vi.fn(async () => []),
    listSuggested: vi.fn(async () => []),
    findLinkById: vi.fn(),
    findPair: vi.fn(),
    upsertManualAccepted: vi.fn(),
    setStatus: vi.fn(async () => 1),
  },
}));
vi.mock("../models/OsActivityModel", () => ({
  OsActivityModel: { log: vi.fn(async () => {}) },
}));

import { app } from "./helpers/app";
import { authHeader, superAdminAuthHeader } from "./helpers/auth";
import { OsDocumentModel, IOsDocument } from "../models/OsDocumentModel";
import {
  OsDocumentLinkModel,
  IOsLinkView,
  IOsDocumentLink,
} from "../models/OsDocumentLinkModel";
import { OsActivityModel } from "../models/OsActivityModel";

const DOC_ID = "0b6ff26e-3a5e-4d2b-9d3c-000000000001";
const TARGET_ID = "0b6ff26e-3a5e-4d2b-9d3c-000000000002";
const LINK_ID = "0b6ff26e-3a5e-4d2b-9d3c-0000000000aa";

const baseDoc: IOsDocument = {
  id: DOC_ID,
  folder_id: null,
  title: "Source",
  slug: "source",
  current_version_id: null,
  status: "indexed",
  owner_id: 1,
  created_by: 1,
  created_at: new Date(),
  updated_at: new Date(),
  archived_at: null,
};

const targetDoc: IOsDocument = { ...baseDoc, id: TARGET_ID, title: "Target", slug: "target" };

const linkView = (overrides: Partial<IOsLinkView> = {}): IOsLinkView => ({
  id: LINK_ID,
  origin: "ai_suggested",
  status: "suggested",
  created_at: new Date(),
  doc_id: TARGET_ID,
  doc_title: "Target",
  doc_status: "indexed",
  doc_archived_at: null,
  ...overrides,
});

const okEnvelope = z.object({
  success: z.literal(true),
  data: z.unknown(),
  error: z.null(),
});
const errorEnvelope = z.object({
  success: z.literal(false),
  data: z.null(),
  error: z.object({ code: z.string(), message: z.string(), details: z.unknown() }),
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(OsDocumentLinkModel.listOutboundAccepted).mockResolvedValue([]);
  vi.mocked(OsDocumentLinkModel.listInboundAccepted).mockResolvedValue([]);
  vi.mocked(OsDocumentLinkModel.listSuggested).mockResolvedValue([]);
});

describe("GET /api/admin/os/documents/:id/links", () => {
  it("returns the three buckets shaped for the Related rail", async () => {
    vi.mocked(OsDocumentModel.findDocumentById).mockResolvedValue(baseDoc);
    vi.mocked(OsDocumentLinkModel.listOutboundAccepted).mockResolvedValue([
      linkView({ status: "accepted", origin: "manual" }),
    ]);
    vi.mocked(OsDocumentLinkModel.listInboundAccepted).mockResolvedValue([
      linkView({ id: "back", status: "accepted", doc_id: "src" }),
    ]);
    vi.mocked(OsDocumentLinkModel.listSuggested).mockResolvedValue([linkView()]);

    const res = await request(app)
      .get(`/api/admin/os/documents/${DOC_ID}/links`)
      .set(superAdminAuthHeader());

    expect(res.status).toBe(200);
    expect(() => okEnvelope.parse(res.body)).not.toThrow();
    expect(res.body.data.links[0].document.id).toBe(TARGET_ID);
    expect(res.body.data.links[0].document.archived).toBe(false);
    expect(res.body.data.backlinks).toHaveLength(1);
    expect(res.body.data.suggested[0].status).toBe("suggested");
  });

  it("404s OS_DOCUMENT_NOT_FOUND for an unknown document", async () => {
    vi.mocked(OsDocumentModel.findDocumentById).mockResolvedValue(undefined);
    const res = await request(app)
      .get(`/api/admin/os/documents/${DOC_ID}/links`)
      .set(superAdminAuthHeader());
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("OS_DOCUMENT_NOT_FOUND");
  });
});

describe("POST /api/admin/os/documents/:id/links", () => {
  it("creates a manual accepted link (201) + logs activity", async () => {
    vi.mocked(OsDocumentModel.findDocumentById)
      .mockResolvedValueOnce(baseDoc) // source
      .mockResolvedValueOnce(targetDoc); // target
    vi.mocked(OsDocumentLinkModel.findPair).mockResolvedValue(undefined);
    const created: IOsDocumentLink = {
      id: LINK_ID,
      source_document_id: DOC_ID,
      target_document_id: TARGET_ID,
      origin: "manual",
      status: "accepted",
      created_by: 1,
      created_at: new Date(),
    };
    vi.mocked(OsDocumentLinkModel.upsertManualAccepted).mockResolvedValue(created);

    const res = await request(app)
      .post(`/api/admin/os/documents/${DOC_ID}/links`)
      .set(superAdminAuthHeader())
      .send({ target_document_id: TARGET_ID });

    expect(res.status).toBe(201);
    expect(() => okEnvelope.parse(res.body)).not.toThrow();
    expect(res.body.data.link.status).toBe("accepted");
    expect(res.body.data.link.document.id).toBe(TARGET_ID);
    expect(OsActivityModel.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "link.accepted", target_id: LINK_ID })
    );
  });

  it("409s OS_LINK_DUPLICATE_CONFLICT when the pair is already accepted", async () => {
    vi.mocked(OsDocumentModel.findDocumentById)
      .mockResolvedValueOnce(baseDoc)
      .mockResolvedValueOnce(targetDoc);
    vi.mocked(OsDocumentLinkModel.findPair).mockResolvedValue({
      id: LINK_ID,
      source_document_id: DOC_ID,
      target_document_id: TARGET_ID,
      origin: "manual",
      status: "accepted",
      created_by: 1,
      created_at: new Date(),
    });

    const res = await request(app)
      .post(`/api/admin/os/documents/${DOC_ID}/links`)
      .set(superAdminAuthHeader())
      .send({ target_document_id: TARGET_ID });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("OS_LINK_DUPLICATE_CONFLICT");
    expect(OsDocumentLinkModel.upsertManualAccepted).not.toHaveBeenCalled();
  });

  it("400s OS_LINK_SELF on a self-link", async () => {
    const res = await request(app)
      .post(`/api/admin/os/documents/${DOC_ID}/links`)
      .set(superAdminAuthHeader())
      .send({ target_document_id: DOC_ID });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("OS_LINK_SELF");
  });

  it("404s OS_LINK_TARGET_NOT_FOUND when the target document is missing", async () => {
    vi.mocked(OsDocumentModel.findDocumentById)
      .mockResolvedValueOnce(baseDoc) // source exists
      .mockResolvedValueOnce(undefined); // target missing
    const res = await request(app)
      .post(`/api/admin/os/documents/${DOC_ID}/links`)
      .set(superAdminAuthHeader())
      .send({ target_document_id: TARGET_ID });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("OS_LINK_TARGET_NOT_FOUND");
  });

  it("400s VALIDATION_ERROR when target_document_id is missing (§11.2)", async () => {
    const res = await request(app)
      .post(`/api/admin/os/documents/${DOC_ID}/links`)
      .set(superAdminAuthHeader())
      .send({});
    expect(res.status).toBe(400);
    expect(() => errorEnvelope.parse(res.body)).not.toThrow();
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("PATCH /api/admin/os/links/:id", () => {
  it("accepts a suggestion + logs link.accepted", async () => {
    vi.mocked(OsDocumentLinkModel.findLinkById).mockResolvedValue({
      id: LINK_ID,
      source_document_id: DOC_ID,
      target_document_id: TARGET_ID,
      origin: "ai_suggested",
      status: "suggested",
      created_by: null,
      created_at: new Date(),
    });

    const res = await request(app)
      .patch(`/api/admin/os/links/${LINK_ID}`)
      .set(superAdminAuthHeader())
      .send({ status: "accepted" });

    expect(res.status).toBe(200);
    expect(res.body.data.link).toEqual({ id: LINK_ID, status: "accepted" });
    expect(OsDocumentLinkModel.setStatus).toHaveBeenCalledWith(LINK_ID, "accepted");
    expect(OsActivityModel.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "link.accepted" })
    );
  });

  it("rejects a suggestion + logs link.rejected", async () => {
    vi.mocked(OsDocumentLinkModel.findLinkById).mockResolvedValue({
      id: LINK_ID,
      source_document_id: DOC_ID,
      target_document_id: TARGET_ID,
      origin: "ai_suggested",
      status: "suggested",
      created_by: null,
      created_at: new Date(),
    });

    const res = await request(app)
      .patch(`/api/admin/os/links/${LINK_ID}`)
      .set(superAdminAuthHeader())
      .send({ status: "rejected" });

    expect(res.status).toBe(200);
    expect(OsDocumentLinkModel.setStatus).toHaveBeenCalledWith(LINK_ID, "rejected");
    expect(OsActivityModel.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "link.rejected" })
    );
  });

  it("404s OS_LINK_NOT_FOUND for an unknown link id", async () => {
    vi.mocked(OsDocumentLinkModel.findLinkById).mockResolvedValue(undefined);
    const res = await request(app)
      .patch(`/api/admin/os/links/${LINK_ID}`)
      .set(superAdminAuthHeader())
      .send({ status: "accepted" });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("OS_LINK_NOT_FOUND");
  });

  it("400s VALIDATION_ERROR on an invalid status", async () => {
    const res = await request(app)
      .patch(`/api/admin/os/links/${LINK_ID}`)
      .set(superAdminAuthHeader())
      .send({ status: "maybe" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("links routes — §11.1 auth guards", () => {
  it("401 without a token, 403 without super-admin", async () => {
    const noToken = await request(app).get(
      `/api/admin/os/documents/${DOC_ID}/links`
    );
    expect(noToken.status).toBe(401);

    const nonAdmin = await request(app)
      .get(`/api/admin/os/documents/${DOC_ID}/links`)
      .set(authHeader({ email: "not-an-admin@test.alloro" }));
    expect(nonAdmin.status).toBe(403);
  });
});
