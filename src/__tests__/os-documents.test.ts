/**
 * Hermetic tests — Admin OS documents API (P2 T6,
 * plans/07042026-alloro-os-admin-port; analog: os-routes.smoke.test.ts).
 *
 * Option B: every Os*Model is mocked at the model seam (vi.mock) and the
 * queue factory is mocked, so the REAL routes → validation → controllers →
 * feature-services run with no DB and no Redis. Covers the §8.1 envelope,
 * §11.6 pagination shape, the publish orchestration (version N+1 → bump
 * current → clear draft → tsv → ingest enqueue) and the 400/404/409 paths.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { z } from "zod";

const { queueAdd } = vi.hoisted(() => ({
  queueAdd: vi.fn(async () => ({ id: "job-1" })),
}));

vi.mock("../workers/queues", () => ({
  getOsQueue: vi.fn(() => ({ add: queueAdd })),
  getMindsQueue: vi.fn(() => ({ add: queueAdd })),
  getAuditQueue: vi.fn(() => ({ add: queueAdd })),
  getCrmQueue: vi.fn(() => ({ add: queueAdd })),
  getHarvestQueue: vi.fn(() => ({ add: queueAdd })),
  getGbpAutomationQueue: vi.fn(() => ({ add: queueAdd })),
  getRedisConnection: vi.fn(),
  closeQueues: vi.fn(async () => {}),
}));

vi.mock("../models/OsDocumentModel", () => ({
  OsDocumentModel: {
    transaction: vi.fn(async (cb: (trx: unknown) => Promise<unknown>) => cb({})),
    findDocumentById: vi.fn(),
    findEnrichedById: vi.fn(),
    createDocument: vi.fn(),
    listPaginated: vi.fn(),
    slugExists: vi.fn(async () => false),
    updateTitleAndSlug: vi.fn(async () => 1),
    updateDocumentMeta: vi.fn(async () => 1),
    setStatus: vi.fn(async () => 1),
    setCurrentVersion: vi.fn(async () => 1),
    archiveDocument: vi.fn(async () => 1),
    restoreDocument: vi.fn(async () => 1),
    deleteDocumentById: vi.fn(async () => 1),
    rebuildSearchTsv: vi.fn(async () => {}),
    searchFullText: vi.fn(async () => []),
    countFullTextMatches: vi.fn(async () => 0),
  },
}));

vi.mock("../models/OsDocumentVersionModel", () => ({
  OsDocumentVersionModel: {
    createVersion: vi.fn(),
    findVersionById: vi.fn(),
    findByVersionNo: vi.fn(),
    listForDocumentPaginated: vi.fn(),
    maxVersionNo: vi.fn(async () => 0),
  },
}));

vi.mock("../models/OsDocumentDraftModel", () => ({
  OsDocumentDraftModel: {
    findByDocumentId: vi.fn(),
    saveDraft: vi.fn(async () => {}),
    removeDraft: vi.fn(async () => 1),
  },
}));

vi.mock("../models/OsDocumentAiIndexModel", () => ({
  OsDocumentAiIndexModel: {
    findByDocumentId: vi.fn(),
    upsertFromIngest: vi.fn(async () => {}),
    setMeta: vi.fn(async () => {}),
  },
}));

vi.mock("../models/OsFolderModel", () => ({
  OsFolderModel: {
    findFolderById: vi.fn(),
    listAll: vi.fn(async () => []),
    countDocumentsPerFolder: vi.fn(async () => new Map()),
  },
}));

vi.mock("../models/OsAdminUserModel", () => ({
  OsAdminUserModel: {
    listInternalUsers: vi.fn(async () => []),
    findInternalUserById: vi.fn(),
  },
}));

vi.mock("../models/OsDocumentLockModel", () => ({
  OsDocumentLockModel: {
    findByDocumentId: vi.fn(),
    upsertLock: vi.fn(),
    heartbeatLock: vi.fn(async () => 1),
    releaseLock: vi.fn(async () => 1),
    deleteExpired: vi.fn(async () => 0),
  },
}));

vi.mock("../models/OsActivityModel", () => ({
  OsActivityModel: {
    log: vi.fn(async () => {}),
    listForTarget: vi.fn(async () => []),
  },
}));

import { app } from "./helpers/app";
import { authHeader, superAdminAuthHeader } from "./helpers/auth";
import {
  OsDocumentModel,
  IOsDocument,
  IOsDocumentListItem,
} from "../models/OsDocumentModel";
import { OsDocumentVersionModel } from "../models/OsDocumentVersionModel";
import { OsDocumentDraftModel } from "../models/OsDocumentDraftModel";
import { OsDocumentAiIndexModel } from "../models/OsDocumentAiIndexModel";
import { OsDocumentLockModel } from "../models/OsDocumentLockModel";
import { OsActivityModel } from "../models/OsActivityModel";

const DOC_ID = "0b6ff26e-3a5e-4d2b-9d3c-000000000001";
const VERSION_1_ID = "0b6ff26e-3a5e-4d2b-9d3c-00000000v001";

const baseDoc: IOsDocument = {
  id: DOC_ID,
  folder_id: null,
  title: "Runbook",
  slug: "runbook",
  current_version_id: VERSION_1_ID,
  status: "indexed",
  owner_id: 1,
  created_by: 1,
  created_at: new Date(),
  updated_at: new Date(),
  archived_at: null,
};

const enrichedDoc: IOsDocumentListItem = {
  ...baseDoc,
  category: null,
  tags: [],
  owner: null,
};

const okEnvelope = z.object({
  success: z.literal(true),
  data: z.unknown(),
  error: z.null(),
});

const errorEnvelope = z.object({
  success: z.literal(false),
  data: z.null(),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown(),
  }),
});

const paginationShape = z.object({
  page: z.number(),
  limit: z.number(),
  total: z.number(),
  totalPages: z.number(),
});

beforeEach(() => {
  // resetAllMocks (not clear) so per-test mockResolvedValue implementations
  // never leak into the next test; defaults are re-established here.
  vi.resetAllMocks();
  vi.mocked(OsDocumentModel.transaction).mockImplementation((cb) =>
    cb({} as never)
  );
  vi.mocked(OsDocumentModel.slugExists).mockResolvedValue(false);
});

describe("POST /api/admin/os/documents", () => {
  it("creates doc + v1 + draft, enqueues os-ingest, logs activity, 201 envelope", async () => {
    vi.mocked(OsDocumentModel.createDocument).mockResolvedValue({
      ...baseDoc,
      current_version_id: null,
      status: "processing",
    });
    vi.mocked(OsDocumentVersionModel.createVersion).mockResolvedValue({
      id: VERSION_1_ID,
      document_id: DOC_ID,
      version_no: 1,
      title: "Runbook",
      content_md: "# Hello",
      toc_json: [],
      ai_change_summary: null,
      human_note: null,
      author_id: 1,
      created_at: new Date(),
    });
    vi.mocked(OsDocumentModel.findEnrichedById).mockResolvedValue(enrichedDoc);

    const res = await request(app)
      .post("/api/admin/os/documents")
      .set(superAdminAuthHeader())
      .send({ title: "Runbook", content_md: "# Hello" });

    expect(res.status).toBe(201);
    expect(() => okEnvelope.parse(res.body)).not.toThrow();
    expect(res.body.data.document.id).toBe(DOC_ID);

    expect(OsDocumentModel.createDocument).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Runbook", slug: "runbook", status: "processing" }),
      expect.anything()
    );
    expect(OsDocumentVersionModel.createVersion).toHaveBeenCalledWith(
      expect.objectContaining({ version_no: 1, content_md: "# Hello" }),
      expect.anything()
    );
    expect(OsDocumentDraftModel.saveDraft).toHaveBeenCalled();
    expect(OsDocumentModel.rebuildSearchTsv).toHaveBeenCalled();
    expect(OsActivityModel.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "document.created", target_id: DOC_ID })
    );
    expect(queueAdd).toHaveBeenCalledWith(
      "os-ingest",
      { documentId: DOC_ID },
      expect.objectContaining({ jobId: `os-ingest-${DOC_ID}` })
    );
  });

  it("suffixes the slug on collision", async () => {
    vi.mocked(OsDocumentModel.slugExists)
      .mockResolvedValueOnce(true) // runbook taken
      .mockResolvedValueOnce(false); // runbook-2 free
    vi.mocked(OsDocumentModel.createDocument).mockResolvedValue(baseDoc);
    vi.mocked(OsDocumentVersionModel.createVersion).mockResolvedValue({
      id: VERSION_1_ID,
      document_id: DOC_ID,
      version_no: 1,
      title: "Runbook",
      content_md: "",
      toc_json: [],
      ai_change_summary: null,
      human_note: null,
      author_id: 1,
      created_at: new Date(),
    });
    vi.mocked(OsDocumentModel.findEnrichedById).mockResolvedValue(enrichedDoc);

    const res = await request(app)
      .post("/api/admin/os/documents")
      .set(superAdminAuthHeader())
      .send({ title: "Runbook" });

    expect(res.status).toBe(201);
    expect(OsDocumentModel.createDocument).toHaveBeenCalledWith(
      expect.objectContaining({ slug: "runbook-2" }),
      expect.anything()
    );
  });

  it("rejects a missing title with the enforce-mode 400 envelope (§11.2)", async () => {
    const res = await request(app)
      .post("/api/admin/os/documents")
      .set(superAdminAuthHeader())
      .send({ content_md: "no title" });

    expect(res.status).toBe(400);
    expect(() => errorEnvelope.parse(res.body)).not.toThrow();
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 401 without a token and 403 for a non-super-admin (§11.1)", async () => {
    const noToken = await request(app)
      .post("/api/admin/os/documents")
      .send({ title: "X" });
    expect(noToken.status).toBe(401);

    const nonAdmin = await request(app)
      .post("/api/admin/os/documents")
      .set(authHeader({ email: "not-an-admin@test.alloro" }))
      .send({ title: "X" });
    expect(nonAdmin.status).toBe(403);
  });
});

describe("GET /api/admin/os/documents", () => {
  it("returns the §11.6 pagination shape", async () => {
    vi.mocked(OsDocumentModel.listPaginated).mockResolvedValue({
      documents: [enrichedDoc],
      total: 41,
    });

    const res = await request(app)
      .get("/api/admin/os/documents?page=2&limit=20")
      .set(superAdminAuthHeader());

    expect(res.status).toBe(200);
    expect(() => okEnvelope.parse(res.body)).not.toThrow();
    expect(() => paginationShape.parse(res.body.data.pagination)).not.toThrow();
    expect(res.body.data.pagination).toEqual({
      page: 2,
      limit: 20,
      total: 41,
      totalPages: 3,
    });
    expect(OsDocumentModel.listPaginated).toHaveBeenCalledWith(
      expect.any(Object),
      { limit: 20, offset: 20 }
    );
  });
});

describe("GET /api/admin/os/documents/:id", () => {
  it("404s with OS_DOCUMENT_NOT_FOUND for an unknown id", async () => {
    vi.mocked(OsDocumentModel.findEnrichedById).mockResolvedValue(undefined);

    const res = await request(app)
      .get(`/api/admin/os/documents/${DOC_ID}`)
      .set(superAdminAuthHeader());

    expect(res.status).toBe(404);
    expect(() => errorEnvelope.parse(res.body)).not.toThrow();
    expect(res.body.error.code).toBe("OS_DOCUMENT_NOT_FOUND");
  });
});

describe("PATCH /api/admin/os/documents/:id/meta", () => {
  it("404s with OS_OWNER_NOT_FOUND when the owner is not internal", async () => {
    vi.mocked(OsDocumentModel.findDocumentById).mockResolvedValue(baseDoc);

    const res = await request(app)
      .patch(`/api/admin/os/documents/${DOC_ID}/meta`)
      .set(superAdminAuthHeader())
      .send({ owner_id: 999 });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("OS_OWNER_NOT_FOUND");
  });

  it("routes category/tags through setMeta (meta_locked) + rebuilds tsv", async () => {
    vi.mocked(OsDocumentModel.findDocumentById).mockResolvedValue(baseDoc);
    vi.mocked(OsDocumentModel.findEnrichedById).mockResolvedValue({
      ...enrichedDoc,
      category: "Ops",
      tags: ["runbooks"],
    });

    const res = await request(app)
      .patch(`/api/admin/os/documents/${DOC_ID}/meta`)
      .set(superAdminAuthHeader())
      .send({ category: "Ops", tags: ["runbooks"] });

    expect(res.status).toBe(200);
    expect(OsDocumentAiIndexModel.setMeta).toHaveBeenCalledWith(
      DOC_ID,
      { category: "Ops", tags: ["runbooks"] },
      expect.anything()
    );
    expect(OsDocumentModel.rebuildSearchTsv).toHaveBeenCalled();
    expect(OsActivityModel.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "document.meta_updated" })
    );
  });
});

describe("POST /api/admin/os/documents/:id/publish", () => {
  const liveVersion = {
    id: VERSION_1_ID,
    document_id: DOC_ID,
    version_no: 1,
    title: "Runbook",
    content_md: "old content",
    toc_json: [],
    ai_change_summary: null,
    human_note: null,
    author_id: 1,
    created_at: new Date(),
  };

  it("orchestrates version N+1 → current bump → draft clear → tsv → ingest", async () => {
    vi.mocked(OsDocumentModel.findDocumentById).mockResolvedValue(baseDoc);
    vi.mocked(OsDocumentVersionModel.maxVersionNo).mockResolvedValue(1);
    vi.mocked(OsDocumentDraftModel.findByDocumentId).mockResolvedValue({
      document_id: DOC_ID,
      content_md: "new content",
      base_version: 1,
      updated_by: 1,
      updated_at: new Date(),
    });
    vi.mocked(OsDocumentVersionModel.findVersionById).mockResolvedValue(liveVersion);
    const newVersionId = "0b6ff26e-3a5e-4d2b-9d3c-00000000v002";
    vi.mocked(OsDocumentVersionModel.createVersion).mockResolvedValue({
      ...liveVersion,
      id: newVersionId,
      version_no: 2,
      content_md: "new content",
    });

    const res = await request(app)
      .post(`/api/admin/os/documents/${DOC_ID}/publish`)
      .set(superAdminAuthHeader())
      .send({ base_version: 1, note: "why" });

    expect(res.status).toBe(201);
    expect(() => okEnvelope.parse(res.body)).not.toThrow();
    expect(res.body.data.version.version_no).toBe(2);

    expect(OsDocumentVersionModel.createVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        version_no: 2,
        content_md: "new content",
        human_note: "why",
      }),
      expect.anything()
    );
    expect(OsDocumentModel.setCurrentVersion).toHaveBeenCalledWith(
      DOC_ID,
      newVersionId,
      expect.anything()
    );
    expect(OsDocumentDraftModel.removeDraft).toHaveBeenCalledWith(
      DOC_ID,
      expect.anything()
    );
    expect(OsDocumentModel.rebuildSearchTsv).toHaveBeenCalled();
    expect(OsActivityModel.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "document.version_published" })
    );
    expect(queueAdd).toHaveBeenCalledWith(
      "os-ingest",
      { documentId: DOC_ID },
      expect.objectContaining({ jobId: `os-ingest-${DOC_ID}` })
    );
  });

  it("409s OS_VERSION_CONFLICT on a stale base_version", async () => {
    vi.mocked(OsDocumentModel.findDocumentById).mockResolvedValue(baseDoc);
    vi.mocked(OsDocumentVersionModel.maxVersionNo).mockResolvedValue(3);

    const res = await request(app)
      .post(`/api/admin/os/documents/${DOC_ID}/publish`)
      .set(superAdminAuthHeader())
      .send({ base_version: 1 });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("OS_VERSION_CONFLICT");
    expect(res.body.error.details).toEqual({ current_version: 3 });
    expect(OsDocumentVersionModel.createVersion).not.toHaveBeenCalled();
  });

  it("409s OS_LOCK_HELD while another user's live lock exists", async () => {
    vi.mocked(OsDocumentModel.findDocumentById).mockResolvedValue(baseDoc);
    vi.mocked(OsDocumentLockModel.findByDocumentId).mockResolvedValue({
      document_id: DOC_ID,
      locked_by: 77,
      acquired_at: new Date(),
      heartbeat_at: new Date(),
      expires_at: new Date(Date.now() + 60_000),
    });

    const res = await request(app)
      .post(`/api/admin/os/documents/${DOC_ID}/publish`)
      .set(superAdminAuthHeader())
      .send({ base_version: 1 });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("OS_LOCK_HELD");
  });

  it("400s OS_VERSION_NO_CHANGES when draft matches live and title unchanged", async () => {
    vi.mocked(OsDocumentModel.findDocumentById).mockResolvedValue(baseDoc);
    vi.mocked(OsDocumentVersionModel.maxVersionNo).mockResolvedValue(1);
    vi.mocked(OsDocumentDraftModel.findByDocumentId).mockResolvedValue({
      document_id: DOC_ID,
      content_md: "old content",
      base_version: 1,
      updated_by: 1,
      updated_at: new Date(),
    });
    vi.mocked(OsDocumentVersionModel.findVersionById).mockResolvedValue(liveVersion);

    const res = await request(app)
      .post(`/api/admin/os/documents/${DOC_ID}/publish`)
      .set(superAdminAuthHeader())
      .send({ base_version: 1 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("OS_VERSION_NO_CHANGES");
  });
});

describe("DELETE /api/admin/os/documents/:id (archive)", () => {
  it("archives, force-releases the lock, and logs document.archived", async () => {
    vi.mocked(OsDocumentModel.findDocumentById).mockResolvedValue(baseDoc);
    vi.mocked(OsDocumentModel.findEnrichedById).mockResolvedValue({
      ...enrichedDoc,
      status: "archived",
      archived_at: new Date(),
    });

    const res = await request(app)
      .delete(`/api/admin/os/documents/${DOC_ID}`)
      .set(superAdminAuthHeader());

    expect(res.status).toBe(200);
    expect(OsDocumentModel.archiveDocument).toHaveBeenCalledWith(DOC_ID);
    expect(OsDocumentLockModel.releaseLock).toHaveBeenCalledWith(DOC_ID);
    expect(OsActivityModel.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "document.archived" })
    );
  });
});
