/**
 * Hermetic tests — Admin OS comments API (P7 T1,
 * plans/07042026-alloro-os-admin-port; analog: os-links.test.ts). Every
 * Os*Model is mocked at the seam so the REAL routes → validation → controller →
 * OsCommentService run with no DB. The thread lifecycle against live Postgres
 * lives in src/integration-tests/os/p7-comments.itest.ts.
 *
 * Covers: threaded GET (roots + one reply level), tombstone soft-delete keeps
 * the row + hides the body, AUTHOR-ONLY edit/delete (403 for a non-author,
 * enforced server-side §5.4), version_tag capture at create time, the §8.1
 * envelope, and the §11.1 auth guards. Two users share the super-admin email
 * but carry different JWT userIds — the author gate keys on userId, not email.
 *
 * There are ZERO task fields anywhere (is_task/assignee/due/status): pmtool
 * owns tasks (master D-scope). The mocked model has no such columns.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { z } from "zod";

vi.mock("../models/OsDocumentModel", () => ({
  OsDocumentModel: {
    findDocumentById: vi.fn(),
  },
}));
vi.mock("../models/OsDocumentVersionModel", () => ({
  OsDocumentVersionModel: {
    maxVersionNo: vi.fn(async () => 0),
  },
}));
vi.mock("../models/OsCommentModel", () => ({
  OsCommentModel: {
    listForDocument: vi.fn(async () => []),
    findById: vi.fn(),
    createComment: vi.fn(),
    updateBody: vi.fn(async () => 1),
    softDelete: vi.fn(async () => 1),
  },
}));
vi.mock("../models/OsActivityModel", () => ({
  OsActivityModel: { log: vi.fn(async () => {}) },
}));

import { app } from "./helpers/app";
import { authHeader, superAdminAuthHeader, SUPER_ADMIN_EMAIL } from "./helpers/auth";
import { OsDocumentModel, IOsDocument } from "../models/OsDocumentModel";
import { OsDocumentVersionModel } from "../models/OsDocumentVersionModel";
import { OsCommentModel, IOsCommentView } from "../models/OsCommentModel";
import { OsActivityModel } from "../models/OsActivityModel";

const DOC_ID = "0b6ff26e-3a5e-4d2b-9d3c-000000000001";
const ROOT_ID = "0b6ff26e-3a5e-4d2b-9d3c-0000000000a1";
const REPLY_ID = "0b6ff26e-3a5e-4d2b-9d3c-0000000000a2";

const AUTHOR_ID = 1; // the default super-admin token's userId
const OTHER_ID = 2; // a second super-admin (same email, different userId)

/** A super-admin header whose JWT carries a specific author userId. */
const asUser = (userId: number) =>
  authHeader({ userId, email: SUPER_ADMIN_EMAIL });

const baseDoc: IOsDocument = {
  id: DOC_ID,
  folder_id: null,
  title: "Doc",
  slug: "doc",
  current_version_id: null,
  status: "indexed",
  owner_id: 1,
  created_by: 1,
  created_at: new Date(),
  updated_at: new Date(),
  archived_at: null,
};

const commentView = (overrides: Partial<IOsCommentView> = {}): IOsCommentView => ({
  id: ROOT_ID,
  document_id: DOC_ID,
  parent_comment_id: null,
  author_id: AUTHOR_ID,
  body_md: "Hello **world**",
  version_tag: 3,
  created_at: new Date(),
  updated_at: new Date(),
  deleted_at: null,
  author: { id: AUTHOR_ID, name: "Author One", email: SUPER_ADMIN_EMAIL },
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
  vi.mocked(OsDocumentModel.findDocumentById).mockResolvedValue(baseDoc);
  vi.mocked(OsDocumentVersionModel.maxVersionNo).mockResolvedValue(0);
  vi.mocked(OsCommentModel.listForDocument).mockResolvedValue([]);
  vi.mocked(OsCommentModel.updateBody).mockResolvedValue(1);
  vi.mocked(OsCommentModel.softDelete).mockResolvedValue(1);
});

describe("GET /api/admin/os/documents/:id/comments", () => {
  it("threads roots with one level of replies and returns the live version", async () => {
    vi.mocked(OsDocumentVersionModel.maxVersionNo).mockResolvedValue(4);
    vi.mocked(OsCommentModel.listForDocument).mockResolvedValue([
      commentView({ id: ROOT_ID }),
      commentView({ id: REPLY_ID, parent_comment_id: ROOT_ID, body_md: "a reply" }),
    ]);

    const res = await request(app)
      .get(`/api/admin/os/documents/${DOC_ID}/comments`)
      .set(superAdminAuthHeader());

    expect(res.status).toBe(200);
    expect(() => okEnvelope.parse(res.body)).not.toThrow();
    expect(res.body.data.liveVersionNo).toBe(4);
    expect(res.body.data.comments).toHaveLength(1);
    expect(res.body.data.comments[0].id).toBe(ROOT_ID);
    expect(res.body.data.comments[0].replies).toHaveLength(1);
    expect(res.body.data.comments[0].replies[0].id).toBe(REPLY_ID);
    // Author identity is projected for the avatar/name.
    expect(res.body.data.comments[0].author.email).toBe(SUPER_ADMIN_EMAIL);
  });

  it("blanks the body of a tombstoned comment but keeps its slot", async () => {
    vi.mocked(OsCommentModel.listForDocument).mockResolvedValue([
      commentView({
        id: ROOT_ID,
        body_md: "secret text",
        deleted_at: new Date(),
      }),
    ]);

    const res = await request(app)
      .get(`/api/admin/os/documents/${DOC_ID}/comments`)
      .set(superAdminAuthHeader());

    expect(res.status).toBe(200);
    expect(res.body.data.comments).toHaveLength(1);
    expect(res.body.data.comments[0].deleted).toBe(true);
    expect(res.body.data.comments[0].body_md).toBe(""); // no deleted text leaks
  });

  it("404s OS_DOCUMENT_NOT_FOUND for an unknown document", async () => {
    vi.mocked(OsDocumentModel.findDocumentById).mockResolvedValue(undefined);
    const res = await request(app)
      .get(`/api/admin/os/documents/${DOC_ID}/comments`)
      .set(superAdminAuthHeader());
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("OS_DOCUMENT_NOT_FOUND");
  });
});

describe("POST /api/admin/os/documents/:id/comments", () => {
  it("creates a comment (201), captures version_tag, logs comment.created", async () => {
    vi.mocked(OsDocumentVersionModel.maxVersionNo).mockResolvedValue(5);
    vi.mocked(OsCommentModel.createComment).mockResolvedValue(
      commentView({ version_tag: 5 }),
    );

    const res = await request(app)
      .post(`/api/admin/os/documents/${DOC_ID}/comments`)
      .set(asUser(AUTHOR_ID))
      .send({ body_md: "Hello **world**" });

    expect(res.status).toBe(201);
    expect(() => okEnvelope.parse(res.body)).not.toThrow();
    expect(res.body.data.comment.version_tag).toBe(5);
    // version_tag captured = the live version at comment time.
    expect(OsCommentModel.createComment).toHaveBeenCalledWith(
      expect.objectContaining({ version_tag: 5, author_id: AUTHOR_ID }),
    );
    expect(OsActivityModel.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "comment.created", target_type: "comment" }),
    );
  });

  it("re-parents a reply-to-reply to the root and logs comment.replied", async () => {
    // The client replies to REPLY_ID, which is itself a reply → root is ROOT_ID.
    vi.mocked(OsCommentModel.findById).mockResolvedValue(
      commentView({ id: REPLY_ID, parent_comment_id: ROOT_ID }),
    );
    vi.mocked(OsCommentModel.createComment).mockResolvedValue(
      commentView({ id: "new", parent_comment_id: ROOT_ID }),
    );

    const res = await request(app)
      .post(`/api/admin/os/documents/${DOC_ID}/comments`)
      .set(asUser(AUTHOR_ID))
      .send({ body_md: "nested reply", parent_comment_id: REPLY_ID });

    expect(res.status).toBe(201);
    expect(OsCommentModel.createComment).toHaveBeenCalledWith(
      expect.objectContaining({ parent_comment_id: ROOT_ID }), // flattened to root
    );
    expect(OsActivityModel.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "comment.replied" }),
    );
  });

  it("400s VALIDATION_ERROR when body_md is empty (§11.2)", async () => {
    const res = await request(app)
      .post(`/api/admin/os/documents/${DOC_ID}/comments`)
      .set(asUser(AUTHOR_ID))
      .send({ body_md: "   " });
    expect(res.status).toBe(400);
    expect(() => errorEnvelope.parse(res.body)).not.toThrow();
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("PATCH /api/admin/os/comments/:id — author-only (§5.4)", () => {
  it("lets the author edit their own comment", async () => {
    vi.mocked(OsCommentModel.findById)
      .mockResolvedValueOnce(commentView({ author_id: AUTHOR_ID })) // gate read
      .mockResolvedValueOnce(commentView({ author_id: AUTHOR_ID, body_md: "edited" })); // re-read

    const res = await request(app)
      .patch(`/api/admin/os/comments/${ROOT_ID}`)
      .set(asUser(AUTHOR_ID))
      .send({ body_md: "edited" });

    expect(res.status).toBe(200);
    expect(res.body.data.comment.body_md).toBe("edited");
    expect(OsCommentModel.updateBody).toHaveBeenCalledWith(ROOT_ID, "edited");
  });

  it("403s OS_COMMENT_ACCESS_DENIED when a non-author edits", async () => {
    vi.mocked(OsCommentModel.findById).mockResolvedValue(
      commentView({ author_id: AUTHOR_ID }),
    );

    const res = await request(app)
      .patch(`/api/admin/os/comments/${ROOT_ID}`)
      .set(asUser(OTHER_ID)) // different userId → not the author
      .send({ body_md: "hijack" });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("OS_COMMENT_ACCESS_DENIED");
    expect(OsCommentModel.updateBody).not.toHaveBeenCalled();
  });

  it("404s OS_COMMENT_NOT_FOUND for an unknown comment", async () => {
    vi.mocked(OsCommentModel.findById).mockResolvedValue(undefined);
    const res = await request(app)
      .patch(`/api/admin/os/comments/${ROOT_ID}`)
      .set(asUser(AUTHOR_ID))
      .send({ body_md: "x" });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("OS_COMMENT_NOT_FOUND");
  });
});

describe("DELETE /api/admin/os/comments/:id — author-only tombstone (§5.4)", () => {
  it("lets the author tombstone their own comment and logs comment.deleted", async () => {
    vi.mocked(OsCommentModel.findById).mockResolvedValue(
      commentView({ author_id: AUTHOR_ID, deleted_at: null }),
    );

    const res = await request(app)
      .delete(`/api/admin/os/comments/${ROOT_ID}`)
      .set(asUser(AUTHOR_ID));

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ id: ROOT_ID, deleted: true });
    expect(OsCommentModel.softDelete).toHaveBeenCalledWith(ROOT_ID);
    expect(OsActivityModel.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "comment.deleted", target_type: "comment" }),
    );
  });

  it("403s OS_COMMENT_ACCESS_DENIED when a non-author deletes", async () => {
    vi.mocked(OsCommentModel.findById).mockResolvedValue(
      commentView({ author_id: AUTHOR_ID }),
    );

    const res = await request(app)
      .delete(`/api/admin/os/comments/${ROOT_ID}`)
      .set(asUser(OTHER_ID));

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("OS_COMMENT_ACCESS_DENIED");
    expect(OsCommentModel.softDelete).not.toHaveBeenCalled();
  });
});

describe("comments routes — §11.1 auth guards", () => {
  it("401 without a token, 403 without super-admin", async () => {
    const noToken = await request(app).get(
      `/api/admin/os/documents/${DOC_ID}/comments`,
    );
    expect(noToken.status).toBe(401);

    const nonAdmin = await request(app)
      .get(`/api/admin/os/documents/${DOC_ID}/comments`)
      .set(authHeader({ email: "not-an-admin@test.alloro" }));
    expect(nonAdmin.status).toBe(403);
  });
});
