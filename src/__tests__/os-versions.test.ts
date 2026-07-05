/**
 * Hermetic tests — Admin OS versions API + the LCS line-diff util (P2 T6).
 * Model seams mocked (Option B); the diff endpoint runs the REAL
 * feature-utils/osLineDiff against mocked version/draft content.
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
    setCurrentVersion: vi.fn(async () => 1),
    rebuildSearchTsv: vi.fn(async () => {}),
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

vi.mock("../models/OsDocumentLockModel", () => ({
  OsDocumentLockModel: {
    findByDocumentId: vi.fn(),
    releaseLock: vi.fn(async () => 1),
    deleteExpired: vi.fn(async () => 0),
  },
}));

vi.mock("../models/OsActivityModel", () => ({
  OsActivityModel: { log: vi.fn(async () => {}) },
}));

import { app } from "./helpers/app";
import { superAdminAuthHeader } from "./helpers/auth";
import { OsDocumentModel, IOsDocument } from "../models/OsDocumentModel";
import { OsDocumentVersionModel } from "../models/OsDocumentVersionModel";
import { OsDocumentDraftModel } from "../models/OsDocumentDraftModel";
import {
  lineDiff,
  countChangedLines,
  hasChanges,
} from "../controllers/admin-os/feature-utils/osLineDiff";

const DOC_ID = "0b6ff26e-3a5e-4d2b-9d3c-000000000002";

const baseDoc: IOsDocument = {
  id: DOC_ID,
  folder_id: null,
  title: "Playbook",
  slug: "playbook",
  current_version_id: "v-current",
  status: "indexed",
  owner_id: 1,
  created_by: 1,
  created_at: new Date(),
  updated_at: new Date(),
  archived_at: null,
};

function makeVersion(versionNo: number, content: string) {
  return {
    id: `v-${versionNo}`,
    document_id: DOC_ID,
    version_no: versionNo,
    title: "Playbook",
    content_md: content,
    toc_json: [],
    ai_change_summary: null,
    human_note: null,
    author_id: 1,
    created_at: new Date(),
  };
}

const paginationShape = z.object({
  page: z.number(),
  limit: z.number(),
  total: z.number(),
  totalPages: z.number(),
});

beforeEach(() => {
  // resetAllMocks (not clear) so per-test implementations never leak forward.
  vi.resetAllMocks();
  vi.mocked(OsDocumentModel.transaction).mockImplementation((cb) =>
    cb({} as never)
  );
  vi.mocked(OsDocumentModel.findDocumentById).mockResolvedValue(baseDoc);
});

describe("feature-utils/osLineDiff (pure)", () => {
  it("emits context/remove/add hunks with removes before adds", () => {
    const hunks = lineDiff("a\nb\nc", "a\nB\nc");
    expect(hunks).toEqual([
      { type: "context", text: "a" },
      { type: "remove", text: "b" },
      { type: "add", text: "B" },
      { type: "context", text: "c" },
    ]);
    expect(countChangedLines(hunks)).toBe(2);
  });

  it("handles empty → content and identical inputs", () => {
    expect(lineDiff("", "x\ny")).toEqual([
      { type: "add", text: "x" },
      { type: "add", text: "y" },
    ]);
    expect(lineDiff("same\nlines", "same\nlines")).toEqual([
      { type: "context", text: "same" },
      { type: "context", text: "lines" },
    ]);
    expect(hasChanges("a", "a")).toBe(false);
    expect(hasChanges("a", "b")).toBe(true);
  });
});

describe("GET /api/admin/os/documents/:id/versions", () => {
  it("returns the §11.6 pagination shape", async () => {
    vi.mocked(OsDocumentVersionModel.listForDocumentPaginated).mockResolvedValue({
      versions: [makeVersion(2, "b"), makeVersion(1, "a")],
      total: 2,
    });

    const res = await request(app)
      .get(`/api/admin/os/documents/${DOC_ID}/versions`)
      .set(superAdminAuthHeader());

    expect(res.status).toBe(200);
    expect(() => paginationShape.parse(res.body.data.pagination)).not.toThrow();
    expect(res.body.data.versions).toHaveLength(2);
  });
});

describe("GET /api/admin/os/documents/:id/versions/diff", () => {
  it("diffs a version against the draft with real hunks", async () => {
    vi.mocked(OsDocumentVersionModel.findByVersionNo).mockResolvedValue(
      makeVersion(1, "intro\nold line\noutro")
    );
    vi.mocked(OsDocumentDraftModel.findByDocumentId).mockResolvedValue({
      document_id: DOC_ID,
      content_md: "intro\nnew line\noutro",
      base_version: 1,
      updated_by: 1,
      updated_at: new Date(),
    });

    const res = await request(app)
      .get(`/api/admin/os/documents/${DOC_ID}/versions/diff?from=1&to=draft`)
      .set(superAdminAuthHeader());

    expect(res.status).toBe(200);
    expect(res.body.data.from).toBe("v1");
    expect(res.body.data.to).toBe("draft");
    expect(res.body.data.hunks).toEqual([
      { type: "context", text: "intro" },
      { type: "remove", text: "old line" },
      { type: "add", text: "new line" },
      { type: "context", text: "outro" },
    ]);
  });
});

describe("GET /api/admin/os/documents/:id/versions/:versionNo", () => {
  it("404s with OS_VERSION_NOT_FOUND for a missing version", async () => {
    vi.mocked(OsDocumentVersionModel.findByVersionNo).mockResolvedValue(undefined);

    const res = await request(app)
      .get(`/api/admin/os/documents/${DOC_ID}/versions/9`)
      .set(superAdminAuthHeader());

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("OS_VERSION_NOT_FOUND");
  });
});

describe("POST /api/admin/os/documents/:id/restore", () => {
  it("appends v(N+1) with the target version's content and re-ingests", async () => {
    vi.mocked(OsDocumentVersionModel.findByVersionNo).mockResolvedValue(
      makeVersion(1, "the old body")
    );
    vi.mocked(OsDocumentVersionModel.maxVersionNo).mockResolvedValue(3);
    vi.mocked(OsDocumentVersionModel.createVersion).mockResolvedValue(
      makeVersion(4, "the old body")
    );

    const res = await request(app)
      .post(`/api/admin/os/documents/${DOC_ID}/restore`)
      .set(superAdminAuthHeader())
      .send({ version_no: 1 });

    expect(res.status).toBe(201);
    expect(OsDocumentVersionModel.createVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        version_no: 4,
        content_md: "the old body",
        ai_change_summary: "Reverted to v1",
      }),
      expect.anything()
    );
    expect(OsDocumentModel.setCurrentVersion).toHaveBeenCalled();
    expect(OsDocumentDraftModel.removeDraft).toHaveBeenCalled();
    expect(queueAdd).toHaveBeenCalledWith(
      "os-ingest",
      { documentId: DOC_ID },
      expect.objectContaining({ jobId: `os-ingest-${DOC_ID}` })
    );
  });

  it("400s OS_VERSION_RESTORE_NOOP when restoring the live version", async () => {
    vi.mocked(OsDocumentVersionModel.findByVersionNo).mockResolvedValue(
      makeVersion(3, "live")
    );
    vi.mocked(OsDocumentVersionModel.maxVersionNo).mockResolvedValue(3);

    const res = await request(app)
      .post(`/api/admin/os/documents/${DOC_ID}/restore`)
      .set(superAdminAuthHeader())
      .send({ version_no: 3 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("OS_VERSION_RESTORE_NOOP");
    expect(OsDocumentVersionModel.createVersion).not.toHaveBeenCalled();
  });
});
