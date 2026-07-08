/**
 * P7 Comments integration proof — REAL database, no model mocks
 * (plans/07042026-alloro-os-admin-port, P7 phase gate). Target: the disposable
 * local pgvector replica the worktree .env points at (alloro_admin_os_test),
 * never shared dev/prod. Schema `os` is already migrated (P1 leaves it so).
 *
 * Proves against live Postgres, through OsCommentService:
 *   1. comment + reply thread (one nesting level; a reply-to-reply re-parents)
 *   2. version_tag = the document's live version at comment time (v1 → v2)
 *   3. edit is author-only: the author succeeds, a non-author 403s (§5.4)
 *   4. delete is a tombstone: the row stays, deleted_at is set, body is hidden,
 *      and the reply under it survives (thread shape preserved)
 *
 * There are ZERO task fields anywhere (pmtool owns tasks). BullMQ is mocked at
 * the module seam — no Redis. Synthetic users + every os.* row created here is
 * removed in afterAll, leaving the DB migrated + clean.
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
import { OsCommentService } from "../../controllers/admin-os/feature-services/OsCommentService";
import { OsError } from "../../controllers/admin-os/feature-utils/OsError";
import { OsCommentModel } from "../../models/OsCommentModel";

const RUN_TAG = `p7itest-${Date.now()}`;
let userA = 0;
let userB = 0;
const docIds: string[] = [];

async function createUser(label: string): Promise<number> {
  const result = await db.raw(
    `insert into users (email, name, is_internal) values (?, ?, true) returning id`,
    [`${RUN_TAG}-${label}@test.alloro`, `P7 itest ${label}`]
  );
  return Number(result.rows[0].id);
}

async function expectOsError(
  promise: Promise<unknown>,
  code: string
): Promise<void> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(OsError);
    expect((error as OsError).code).toBe(code);
    return;
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
  // Cascade wipes comments for every tracked document; clean activity + users.
  for (const id of docIds) {
    await db.raw(`delete from os.documents where id = ?`, [id]);
  }
  await db.raw(`delete from os.activity where actor_id in (?, ?)`, [
    userA,
    userB,
  ]);
  await db.raw(`delete from users where email like ?`, [`${RUN_TAG}-%`]);
  await db.destroy();
});

describe("P7 Comments — thread, version_tag, author-only, tombstone", () => {
  it("threads a reply and stamps version_tag with the live version", async () => {
    const doc = await OsDocumentService.createDocument(
      { title: `Comment Target ${RUN_TAG}`, contentMd: "v1 body" },
      userA
    );
    docIds.push(doc.id);

    // A root comment made against v1.
    const root = await OsCommentService.createComment(
      doc.id,
      { bodyMd: "First thought", parentCommentId: null },
      userA
    );
    expect(root.parent_comment_id).toBeNull();
    expect(root.version_tag).toBe(1); // live version at comment time

    // A reply from the other user; a reply-to-reply re-parents to the root.
    const reply = await OsCommentService.createComment(
      doc.id,
      { bodyMd: "A reply", parentCommentId: root.id },
      userB
    );
    expect(reply.parent_comment_id).toBe(root.id);

    const nested = await OsCommentService.createComment(
      doc.id,
      { bodyMd: "Reply to the reply", parentCommentId: reply.id },
      userA
    );
    expect(nested.parent_comment_id).toBe(root.id); // flattened to one level

    // Publish v2, then a new comment stamps version_tag = 2.
    await OsDocumentService.saveDraft(doc.id, "v2 body", 1, userA);
    await OsDocumentService.publishVersion(doc.id, { baseVersion: 1 }, userA);
    const afterPublish = await OsCommentService.createComment(
      doc.id,
      { bodyMd: "Made against v2", parentCommentId: null },
      userA
    );
    expect(afterPublish.version_tag).toBe(2);

    // The thread groups roots + one reply level; live version reported.
    const thread = await OsCommentService.getThread(doc.id);
    expect(thread.liveVersionNo).toBe(2);
    const rootNode = thread.comments.find((node) => node.id === root.id);
    expect(rootNode).toBeDefined();
    expect(rootNode?.replies).toHaveLength(2); // reply + the flattened nested one
    // Author identity is projected for the avatar/name.
    expect(rootNode?.author?.email).toBe(`${RUN_TAG}-a@test.alloro`);
  });

  it("enforces author-only edit (author OK, non-author 403)", async () => {
    const doc = await OsDocumentService.createDocument(
      { title: `Edit Target ${RUN_TAG}`, contentMd: "body" },
      userA
    );
    docIds.push(doc.id);
    const comment = await OsCommentService.createComment(
      doc.id,
      { bodyMd: "Original", parentCommentId: null },
      userA
    );

    const edited = await OsCommentService.editComment(comment.id, "Edited", userA);
    expect(edited.body_md).toBe("Edited");

    // The other user cannot edit it.
    await expectOsError(
      OsCommentService.editComment(comment.id, "Hijacked", userB),
      "OS_COMMENT_ACCESS_DENIED"
    );

    // The row still holds the author's text, not the hijack attempt.
    const row = await OsCommentModel.findById(comment.id);
    expect(row?.body_md).toBe("Edited");
  });

  it("tombstones on delete: row kept, deleted_at set, body hidden, thread survives", async () => {
    const doc = await OsDocumentService.createDocument(
      { title: `Delete Target ${RUN_TAG}`, contentMd: "body" },
      userA
    );
    docIds.push(doc.id);
    const root = await OsCommentService.createComment(
      doc.id,
      { bodyMd: "Root to delete", parentCommentId: null },
      userA
    );
    await OsCommentService.createComment(
      doc.id,
      { bodyMd: "Reply that must survive", parentCommentId: root.id },
      userB
    );

    // A non-author cannot delete.
    await expectOsError(
      OsCommentService.deleteComment(root.id, userB),
      "OS_COMMENT_ACCESS_DENIED"
    );

    const result = await OsCommentService.deleteComment(root.id, userA);
    expect(result).toEqual({ id: root.id, deleted: true });

    // The row is still present with deleted_at set (tombstone, not a hard delete).
    const raw = await db.raw(
      `select id, body_md, deleted_at from os.comments where id = ?`,
      [root.id]
    );
    expect(raw.rows).toHaveLength(1);
    expect(raw.rows[0].deleted_at).not.toBeNull();

    // The thread keeps the deleted root's slot (body blanked) + its reply.
    const thread = await OsCommentService.getThread(doc.id);
    const rootNode = thread.comments.find((node) => node.id === root.id);
    expect(rootNode?.deleted).toBe(true);
    expect(rootNode?.body_md).toBe(""); // no deleted text leaves the server
    expect(rootNode?.replies).toHaveLength(1); // the reply survives
  });
});
