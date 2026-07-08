/**
 * P2 Library integration proof — REAL database, no model mocks
 * (plans/07042026-alloro-os-admin-port, P2 phase gate). Target: the disposable
 * local pgvector replica the worktree .env points at (alloro_admin_os_test),
 * never shared dev/prod. Schema `os` is already migrated (P1 leaves it so).
 *
 * Proves against live Postgres:
 *   1. create → doc + v1 + seeded draft; slug collision → "-2" suffix
 *   2. publish is transactional (§10.5): injected failure → full rollback
 *   3. meta_locked survives a simulated re-ingest (summary-only refresh)
 *   4. FTS: title match outranks body match; archived rows are excluded
 *   5. locks: acquire / foreign-conflict / expiry takeover
 *   6. folder cycle guard; trash restore; purge hard-delete (cascade)
 *
 * BullMQ is mocked at the module seam — no Redis required; queue behavior is
 * covered hermetically. Synthetic users are created and deleted; every os.*
 * row created here is removed in afterAll, leaving the DB migrated + clean.
 */

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

vi.mock("../../workers/queues", () => {
  const add = vi.fn(async () => ({ id: "itest-job" }));
  const fakeQueue = { add };
  return {
    getOsQueue: vi.fn(() => fakeQueue),
    getMindsQueue: vi.fn(() => fakeQueue),
    getAuditQueue: vi.fn(() => fakeQueue),
    getCrmQueue: vi.fn(() => fakeQueue),
    getHarvestQueue: vi.fn(() => fakeQueue),
    getGbpAutomationQueue: vi.fn(() => fakeQueue),
    getRedisConnection: vi.fn(),
    closeQueues: vi.fn(async () => {}),
  };
});

import { db } from "../../database/connection";
import { OsDocumentService } from "../../controllers/admin-os/feature-services/OsDocumentService";
import { OsVersionService } from "../../controllers/admin-os/feature-services/OsVersionService";
import { OsFolderService } from "../../controllers/admin-os/feature-services/OsFolderService";
import { OsTrashService } from "../../controllers/admin-os/feature-services/OsTrashService";
import { OsLockService } from "../../controllers/admin-os/feature-services/OsLockService";
import { OsFtsSearchService } from "../../controllers/admin-os/feature-services/OsFtsSearchService";
import { OsError } from "../../controllers/admin-os/feature-utils/OsError";
import { OsDocumentModel } from "../../models/OsDocumentModel";
import { OsDocumentVersionModel } from "../../models/OsDocumentVersionModel";
import { OsDocumentDraftModel } from "../../models/OsDocumentDraftModel";
import { OsDocumentAiIndexModel } from "../../models/OsDocumentAiIndexModel";

const RUN_TAG = `p2itest-${Date.now()}`;
let userA = 0;
let userB = 0;
const docIds: string[] = [];
const folderIds: string[] = [];

async function createUser(label: string): Promise<number> {
  const result = await db.raw(
    `insert into users (email, name, is_internal) values (?, ?, true) returning id`,
    [`${RUN_TAG}-${label}@test.alloro`, `P2 itest ${label}`]
  );
  return Number(result.rows[0].id); // users.id is bigint → pg returns a string
}

async function expectOsError(
  promise: Promise<unknown>,
  code: string
): Promise<OsError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(OsError);
    expect((error as OsError).code).toBe(code);
    return error as OsError;
  }
  throw new Error(`Expected OsError ${code}, but the call succeeded`);
}

beforeAll(async () => {
  const schema = await db.raw(
    `select 1 from information_schema.schemata where schema_name = 'os'`
  );
  expect(schema.rows.length).toBe(1); // precondition: P1 migration applied
  userA = await createUser("a");
  userB = await createUser("b");
});

afterAll(async () => {
  // Cascade wipes versions/drafts/ai_index/locks for every tracked document.
  for (const id of docIds) {
    await db.raw(`delete from os.documents where id = ?`, [id]);
  }
  for (const id of folderIds) {
    await db.raw(`delete from os.folders where id = ?`, [id]);
  }
  await db.raw(`delete from os.activity where actor_id in (?, ?)`, [
    userA,
    userB,
  ]);
  await db.raw(
    `delete from os.activity where target_id::text in (select unnest(?::text[]))`,
    [docIds]
  );
  await db.raw(`delete from users where email like ?`, [`${RUN_TAG}-%`]);
  await db.destroy();
});

describe("P2 Library — create, slug collision, drafts", () => {
  it("create seeds v1 + draft and slug-suffixes a colliding title", async () => {
    const first = await OsDocumentService.createDocument(
      { title: `Alpha Guide ${RUN_TAG}`, contentMd: "# Alpha\n\nBody." },
      userA
    );
    docIds.push(first.id);
    expect(first.status).toBe("processing");
    expect(first.slug).toBe(`alpha-guide-${RUN_TAG}`);
    expect(first.current_version_id).not.toBeNull();

    const v1 = await OsDocumentVersionModel.findByVersionNo(first.id, 1);
    expect(v1?.content_md).toBe("# Alpha\n\nBody.");
    const draft = await OsDocumentDraftModel.findByDocumentId(first.id);
    expect(draft?.content_md).toBe("# Alpha\n\nBody.");
    expect(draft?.base_version).toBe(1);

    const second = await OsDocumentService.createDocument(
      { title: `Alpha Guide ${RUN_TAG}` },
      userA
    );
    docIds.push(second.id);
    expect(second.slug).toBe(`alpha-guide-${RUN_TAG}-2`);
  });
});

describe("P2 Library — transactional publish (§10.5)", () => {
  it("rolls back version + current pointer + draft when a step fails", async () => {
    const doc = await OsDocumentService.createDocument(
      { title: `Rollback Target ${RUN_TAG}`, contentMd: "original" },
      userA
    );
    docIds.push(doc.id);

    await OsDocumentService.saveDraft(doc.id, "changed content", 1, userA);
    const before = await OsDocumentModel.findDocumentById(doc.id);

    const removeDraftSpy = vi
      .spyOn(OsDocumentDraftModel, "removeDraft")
      .mockRejectedValueOnce(new Error("injected mid-transaction failure"));
    await expect(
      OsDocumentService.publishVersion(doc.id, { baseVersion: 1 }, userA)
    ).rejects.toThrow("injected mid-transaction failure");
    removeDraftSpy.mockRestore();

    // Nothing moved: no v2 row, pointer unchanged, draft intact.
    expect(await OsDocumentVersionModel.maxVersionNo(doc.id)).toBe(1);
    const after = await OsDocumentModel.findDocumentById(doc.id);
    expect(after?.current_version_id).toBe(before?.current_version_id);
    const draft = await OsDocumentDraftModel.findByDocumentId(doc.id);
    expect(draft?.content_md).toBe("changed content");

    // Same call without the injected failure lands v2 and clears the draft.
    const version = await OsDocumentService.publishVersion(
      doc.id,
      { baseVersion: 1, note: "second try" },
      userA
    );
    expect(version.version_no).toBe(2);
    expect(await OsDocumentDraftModel.findByDocumentId(doc.id)).toBeUndefined();
    const refreshed = await OsDocumentModel.findDocumentById(doc.id);
    expect(refreshed?.current_version_id).toBe(version.id);
  });

  it("restore appends a new version with the old content", async () => {
    const doc = await OsDocumentService.createDocument(
      { title: `Restore Target ${RUN_TAG}`, contentMd: "v1 body" },
      userA
    );
    docIds.push(doc.id);
    await OsDocumentService.saveDraft(doc.id, "v2 body", 1, userA);
    await OsDocumentService.publishVersion(doc.id, { baseVersion: 1 }, userA);

    const restored = await OsVersionService.restoreVersion(doc.id, 1, userA);
    expect(restored.version_no).toBe(3);
    expect(restored.content_md).toBe("v1 body");
    expect(restored.ai_change_summary).toBe("Reverted to v1");
  });
});

describe("P2 Library — meta_locked survives re-ingest", () => {
  it("keeps human category/tags; re-ingest only refreshes the summary", async () => {
    const doc = await OsDocumentService.createDocument(
      { title: `Meta Locked ${RUN_TAG}`, contentMd: "meta body" },
      userA
    );
    docIds.push(doc.id);

    await OsDocumentService.updateMeta(
      doc.id,
      { category: "Human Category", tags: ["human-tag"] },
      userA
    );
    const locked = await OsDocumentAiIndexModel.findByDocumentId(doc.id);
    expect(locked?.meta_locked).toBe(true);

    // Simulate the P4 ingest pipeline writing fresh AI metadata.
    await OsDocumentAiIndexModel.upsertFromIngest(doc.id, {
      summary: "AI summary after re-ingest",
      category: "AI Category",
      tags: ["ai-tag"],
      generatedFor: 1,
    });

    const after = await OsDocumentAiIndexModel.findByDocumentId(doc.id);
    expect(after?.summary).toBe("AI summary after re-ingest");
    expect(after?.category).toBe("Human Category");
    expect(after?.tags).toEqual(["human-tag"]);
    expect(after?.meta_locked).toBe(true);
  });
});

describe("P2 Library — FTS search", () => {
  it("ranks a title match above a body match and hides archived docs", async () => {
    const needle = `quokka${Date.now()}`;
    const titleDoc = await OsDocumentService.createDocument(
      { title: `The ${needle} handbook ${RUN_TAG}`, contentMd: "plain body" },
      userA
    );
    docIds.push(titleDoc.id);
    const bodyDoc = await OsDocumentService.createDocument(
      {
        title: `Unrelated notes ${RUN_TAG}`,
        contentMd: `This body mentions ${needle} exactly once.`,
      },
      userA
    );
    docIds.push(bodyDoc.id);

    const both = await OsFtsSearchService.search({
      query: needle,
      filters: {},
      limit: 10,
      offset: 0,
    });
    expect(both.total).toBe(2);
    expect(both.results.map((hit) => hit.id)).toEqual([
      titleDoc.id, // weight A (title) outranks weight B (body)
      bodyDoc.id,
    ]);
    expect(both.results[0].rank).toBeGreaterThan(both.results[1].rank);

    await OsTrashService.archiveDocument(bodyDoc.id, userA);
    const afterArchive = await OsFtsSearchService.search({
      query: needle,
      filters: {},
      limit: 10,
      offset: 0,
    });
    expect(afterArchive.total).toBe(1);
    expect(afterArchive.results[0].id).toBe(titleDoc.id);
  });
});

describe("P2 Library — edit locks", () => {
  it("acquire / foreign conflict / expiry takeover", async () => {
    const doc = await OsDocumentService.createDocument(
      { title: `Lock Target ${RUN_TAG}` },
      userA
    );
    docIds.push(doc.id);

    const lock = await OsLockService.acquire(doc.id, userA);
    expect(lock.locked_by).toBe(userA);
    expect(new Date(lock.expires_at).getTime()).toBeGreaterThan(Date.now());

    await expectOsError(OsLockService.acquire(doc.id, userB), "OS_LOCK_HELD");
    await expectOsError(
      OsDocumentService.saveDraft(doc.id, "blocked", 1, userB),
      "OS_LOCK_HELD"
    );

    // Force-expire, then the other user can take over (reaper-independent).
    await db.raw(
      `update os.document_locks set expires_at = now() - interval '1 minute' where document_id = ?`,
      [doc.id]
    );
    const takeover = await OsLockService.acquire(doc.id, userB);
    expect(takeover.locked_by).toBe(userB);

    const released = await OsLockService.release(doc.id, userB);
    expect(released).toEqual({ released: true });
  });
});

describe("P2 Library — folders, trash, purge", () => {
  it("rejects a cycle move; restore un-trashes; purge hard-deletes via cascade", async () => {
    const parent = await OsFolderService.createFolder(
      { name: `Parent ${RUN_TAG}` },
      userA
    );
    folderIds.push(parent.id);
    const child = await OsFolderService.createFolder(
      { name: `Child ${RUN_TAG}`, parentId: parent.id },
      userA
    );
    folderIds.push(child.id);

    await expectOsError(
      OsFolderService.updateFolder(parent.id, { parentId: child.id }, userA),
      "OS_FOLDER_CYCLE_CONFLICT"
    );

    const doc = await OsDocumentService.createDocument(
      { title: `Trash Target ${RUN_TAG}`, folderId: child.id, contentMd: "x" },
      userA
    );
    docIds.push(doc.id);

    // Purge is trash-only.
    await expectOsError(
      OsTrashService.requestPurge(doc.id, userA),
      "OS_DOCUMENT_NOT_ARCHIVED_CONFLICT"
    );

    const archived = await OsTrashService.archiveDocument(doc.id, userA);
    expect(archived.status).toBe("archived");
    expect(archived.archived_at).not.toBeNull();

    const restoredDoc = await OsTrashService.restoreFromTrash(doc.id, userA);
    expect(restoredDoc.status).toBe("processing");
    expect(restoredDoc.archived_at).toBeNull();

    await OsTrashService.archiveDocument(doc.id, userA);
    const purge = await OsTrashService.purgeDocument(doc.id);
    expect(purge.purged).toBe(true);
    expect(await OsDocumentModel.findDocumentById(doc.id)).toBeUndefined();
    expect(await OsDocumentVersionModel.maxVersionNo(doc.id)).toBe(0); // cascade
    // A repeat purge run is a safe no-op (§21.1).
    expect((await OsTrashService.purgeDocument(doc.id)).purged).toBe(false);
  });
});
