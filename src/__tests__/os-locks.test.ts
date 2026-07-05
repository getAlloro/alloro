/**
 * Hermetic tests — Admin OS edit locks (P2 T6; master spec D8 semantics):
 * acquire (409 OS_LOCK_HELD on a foreign live lock), heartbeat extends by
 * OS_LOCK_TTL_SECONDS (409 OS_LOCK_NOT_HELD once lost), release idempotent
 * and owner-only (403 otherwise), expired locks read as absent.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

vi.mock("../models/OsDocumentModel", () => ({
  OsDocumentModel: {
    findDocumentById: vi.fn(),
  },
}));

vi.mock("../models/OsDocumentLockModel", () => ({
  OsDocumentLockModel: {
    findByDocumentId: vi.fn(),
    upsertLock: vi.fn(),
    heartbeatLock: vi.fn(),
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
import { OsDocumentLockModel } from "../models/OsDocumentLockModel";
import { OsActivityModel } from "../models/OsActivityModel";
import { getOsKnowledgeBaseConfig } from "../config/osKnowledgeBase";

const DOC_ID = "0b6ff26e-3a5e-4d2b-9d3c-000000000003";
/** superAdminAuthHeader mints userId 1 (helpers/auth DEFAULT_USER_ID). */
const ME = 1;
const OTHER_USER = 42;
const MS_PER_SECOND = 1000;

const baseDoc: IOsDocument = {
  id: DOC_ID,
  folder_id: null,
  title: "Locked doc",
  slug: "locked-doc",
  current_version_id: null,
  status: "indexed",
  owner_id: ME,
  created_by: ME,
  created_at: new Date(),
  updated_at: new Date(),
  archived_at: null,
};

function makeLock(lockedBy: number, expiresInMs: number) {
  return {
    document_id: DOC_ID,
    locked_by: lockedBy,
    acquired_at: new Date(),
    heartbeat_at: new Date(),
    expires_at: new Date(Date.now() + expiresInMs),
  };
}

beforeEach(() => {
  // resetAllMocks (not clear) so per-test implementations never leak forward.
  vi.resetAllMocks();
  vi.mocked(OsDocumentModel.findDocumentById).mockResolvedValue(baseDoc);
  vi.mocked(OsDocumentLockModel.releaseLock).mockResolvedValue(1);
});

describe("POST /api/admin/os/documents/:id/locks (acquire)", () => {
  it("acquires a fresh lock with expiry = now + OS_LOCK_TTL_SECONDS", async () => {
    vi.mocked(OsDocumentLockModel.findByDocumentId).mockResolvedValue(undefined);
    vi.mocked(OsDocumentLockModel.upsertLock).mockResolvedValue(
      makeLock(ME, 120_000)
    );

    const res = await request(app)
      .post(`/api/admin/os/documents/${DOC_ID}/locks`)
      .set(superAdminAuthHeader());

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.lock.locked_by).toBe(ME);

    const ttlMs = getOsKnowledgeBaseConfig().lockTtlSeconds * MS_PER_SECOND;
    const expiresArg = vi.mocked(OsDocumentLockModel.upsertLock).mock
      .calls[0][2] as Date;
    expect(
      Math.abs(expiresArg.getTime() - (Date.now() + ttlMs))
    ).toBeLessThan(5000);
    expect(OsActivityModel.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "lock.acquired", target_id: DOC_ID })
    );
  });

  it("409s OS_LOCK_HELD while another user's live lock exists", async () => {
    vi.mocked(OsDocumentLockModel.findByDocumentId).mockResolvedValue(
      makeLock(OTHER_USER, 60_000)
    );

    const res = await request(app)
      .post(`/api/admin/os/documents/${DOC_ID}/locks`)
      .set(superAdminAuthHeader());

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("OS_LOCK_HELD");
    expect(res.body.error.details.locked_by).toBe(OTHER_USER);
    expect(OsDocumentLockModel.upsertLock).not.toHaveBeenCalled();
  });

  it("takes over another user's EXPIRED lock", async () => {
    vi.mocked(OsDocumentLockModel.findByDocumentId).mockResolvedValue(
      makeLock(OTHER_USER, -60_000)
    );
    vi.mocked(OsDocumentLockModel.upsertLock).mockResolvedValue(
      makeLock(ME, 120_000)
    );

    const res = await request(app)
      .post(`/api/admin/os/documents/${DOC_ID}/locks`)
      .set(superAdminAuthHeader());

    expect(res.status).toBe(200);
    expect(res.body.data.lock.locked_by).toBe(ME);
  });

  it("404s for an unknown document", async () => {
    vi.mocked(OsDocumentModel.findDocumentById).mockResolvedValue(undefined);

    const res = await request(app)
      .post(`/api/admin/os/documents/${DOC_ID}/locks`)
      .set(superAdminAuthHeader());

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("OS_DOCUMENT_NOT_FOUND");
  });
});

describe("POST /api/admin/os/documents/:id/locks/heartbeat", () => {
  it("extends the caller's lock by one TTL", async () => {
    vi.mocked(OsDocumentLockModel.heartbeatLock).mockResolvedValue(1);
    vi.mocked(OsDocumentLockModel.findByDocumentId).mockResolvedValue(
      makeLock(ME, 120_000)
    );

    const res = await request(app)
      .post(`/api/admin/os/documents/${DOC_ID}/locks/heartbeat`)
      .set(superAdminAuthHeader());

    expect(res.status).toBe(200);
    const ttlMs = getOsKnowledgeBaseConfig().lockTtlSeconds * MS_PER_SECOND;
    const expiresArg = vi.mocked(OsDocumentLockModel.heartbeatLock).mock
      .calls[0][2] as Date;
    expect(
      Math.abs(expiresArg.getTime() - (Date.now() + ttlMs))
    ).toBeLessThan(5000);
  });

  it("409s OS_LOCK_NOT_HELD once the lock belongs to someone else", async () => {
    vi.mocked(OsDocumentLockModel.heartbeatLock).mockResolvedValue(0);

    const res = await request(app)
      .post(`/api/admin/os/documents/${DOC_ID}/locks/heartbeat`)
      .set(superAdminAuthHeader());

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("OS_LOCK_NOT_HELD");
  });
});

describe("DELETE /api/admin/os/documents/:id/locks (release)", () => {
  it("is idempotent when no lock exists", async () => {
    vi.mocked(OsDocumentLockModel.findByDocumentId).mockResolvedValue(undefined);

    const res = await request(app)
      .delete(`/api/admin/os/documents/${DOC_ID}/locks`)
      .set(superAdminAuthHeader());

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ released: true });
    expect(OsDocumentLockModel.releaseLock).not.toHaveBeenCalled();
  });

  it("releases the caller's own lock and logs lock.released", async () => {
    vi.mocked(OsDocumentLockModel.findByDocumentId).mockResolvedValue(
      makeLock(ME, 60_000)
    );

    const res = await request(app)
      .delete(`/api/admin/os/documents/${DOC_ID}/locks`)
      .set(superAdminAuthHeader());

    expect(res.status).toBe(200);
    expect(OsDocumentLockModel.releaseLock).toHaveBeenCalledWith(DOC_ID);
    expect(OsActivityModel.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "lock.released" })
    );
  });

  it("403s OS_LOCK_ACCESS_DENIED when someone else holds the lock", async () => {
    vi.mocked(OsDocumentLockModel.findByDocumentId).mockResolvedValue(
      makeLock(OTHER_USER, 60_000)
    );

    const res = await request(app)
      .delete(`/api/admin/os/documents/${DOC_ID}/locks`)
      .set(superAdminAuthHeader());

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("OS_LOCK_ACCESS_DENIED");
    expect(OsDocumentLockModel.releaseLock).not.toHaveBeenCalled();
  });
});

describe("GET /api/admin/os/documents/:id/locks", () => {
  it("reports an expired lock as null", async () => {
    vi.mocked(OsDocumentLockModel.findByDocumentId).mockResolvedValue(
      makeLock(OTHER_USER, -1000)
    );

    const res = await request(app)
      .get(`/api/admin/os/documents/${DOC_ID}/locks`)
      .set(superAdminAuthHeader());

    expect(res.status).toBe(200);
    expect(res.body.data.lock).toBeNull();
  });
});
