/**
 * P5 chat integration proof — REAL local Postgres, no model mocks
 * (plans/07042026-alloro-os-admin-port, P5 phase gate). Target: the disposable
 * local replica the worktree .env points at (alloro_admin_os_test), never
 * shared dev/prod. Schema `os` is already migrated (P1/P2 leave it so).
 *
 * The AI providers are the injected deterministic fakes (§20.4) — no OpenAI, no
 * Gemini — but everything else is live: conversation rows, message rows with a
 * real jsonb citations array, context-document attach/detach against a real
 * document, and the FK cascade that wipes messages + context on conversation
 * delete.
 *
 * Proves against live Postgres:
 *   1. create → the conversation persists and lists with its enriched fields
 *   2. persist user + assistant messages; citations survive the jsonb round-trip;
 *      transcript order is oldest-first; the list preview/count reflect them
 *   3. context attach (idempotent) + detach against a real os.documents row
 *   4. ownership: another user's conversation reads as not-found
 *   5. delete cascade removes messages + context rows with the conversation
 *
 * BullMQ is mocked at the module seam — no Redis. Every os.* row created here is
 * removed in afterAll, leaving the DB migrated + clean.
 */

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

vi.mock("../../workers/queues", () => {
  const add = vi.fn(async () => ({ id: "p5itest-job" }));
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
import { OsChatService } from "../../controllers/admin-os/feature-services/OsChatService";
import { OsDocumentService } from "../../controllers/admin-os/feature-services/OsDocumentService";
import { OsChatConversationModel } from "../../models/OsChatConversationModel";
import { OsChatMessageModel } from "../../models/OsChatMessageModel";
import { OsChatContextDocumentModel } from "../../models/OsChatContextDocumentModel";
import type { IOsChatCitation } from "../../models/OsChatMessageModel";
import {
  OsFakeEmbeddingProvider,
  setOsEmbeddingProvider,
} from "../../controllers/admin-os/feature-services/service.os-embeddings";
import {
  OsFakeLlmProvider,
  setOsLlmProvider,
} from "../../controllers/admin-os/feature-services/service.os-llm";

const RUN_TAG = `p5itest-${Date.now()}`;
let userA = 0;
let userB = 0;
let docId = "";
const conversationIds: string[] = [];

async function createUser(label: string): Promise<number> {
  const result = await db.raw(
    `insert into users (email, name, is_internal) values (?, ?, true) returning id`,
    [`${RUN_TAG}-${label}@test.alloro`, `P5 itest ${label}`]
  );
  return Number(result.rows[0].id);
}

beforeAll(async () => {
  const schema = await db.raw(
    `select 1 from information_schema.schemata where schema_name = 'os'`
  );
  expect(schema.rows.length).toBe(1); // precondition: migration applied

  // Deterministic fakes — the chat pipeline never touches a network here.
  setOsEmbeddingProvider(new OsFakeEmbeddingProvider());
  setOsLlmProvider(new OsFakeLlmProvider());
  userA = await createUser("a");
  userB = await createUser("b");
  // A real document to attach as context (createDocument seeds v1).
  const doc = await OsDocumentService.createDocument(
    { title: `Context Doc ${RUN_TAG}`, contentMd: "# Onboarding\n\nStep one." },
    userA
  );
  docId = doc.id;
});

afterAll(async () => {
  setOsEmbeddingProvider(null);
  setOsLlmProvider(null);
  for (const id of conversationIds) {
    await db.raw(`delete from os.chat_conversations where id = ?`, [id]);
  }
  if (docId) await db.raw(`delete from os.documents where id = ?`, [docId]);
  await db.raw(`delete from os.activity where actor_id in (?, ?)`, [
    userA,
    userB,
  ]);
  await db.raw(`delete from users where email like ?`, [`${RUN_TAG}-%`]);
  await db.destroy();
});

describe("P5 chat — conversation lifecycle on live Postgres", () => {
  it("creates a conversation that persists and lists enriched", async () => {
    const created = await OsChatService.createConversation(userA, "Setup help");
    conversationIds.push(created.id);
    expect(created.message_count).toBe(0);
    expect(created.last_message_preview).toBeNull();

    const list = await OsChatService.listConversations(userA);
    const found = list.find((c) => c.id === created.id);
    expect(found).toBeTruthy();
    expect(found?.title).toBe("Setup help");
    expect(Number(found?.message_count)).toBe(0);
  });

  it("persists user + assistant messages; citations survive the jsonb round-trip", async () => {
    const conv = await OsChatConversationModel.createConversation(userA, null);
    conversationIds.push(conv.id);

    await OsChatService.persistUserMessage(conv.id, "How do I onboard?");
    const citations: IOsChatCitation[] = [
      {
        document_id: docId,
        version_no: 1,
        chunk_index: null,
        heading_path: "Onboarding",
      },
      {
        document_id: docId,
        version_no: 1,
        chunk_index: 0,
        heading_path: "Onboarding > Step one",
      },
    ];
    const assistant = await OsChatService.persistAssistantMessage(
      conv.id,
      "Follow the onboarding steps.",
      citations
    );

    // jsonb citations round-trip exactly (array of the 4-field citation shape).
    expect(assistant.citations).toEqual(citations);
    expect(Array.isArray(assistant.citations)).toBe(true);

    // Transcript is oldest-first: user, then assistant.
    const messages = await OsChatMessageModel.listForConversation(conv.id);
    expect(messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(messages[1].citations).toEqual(citations);

    // The enriched list reflects the new message count + preview.
    const list = await OsChatService.listConversations(userA);
    const row = list.find((c) => c.id === conv.id);
    expect(Number(row?.message_count)).toBe(2);
    expect(row?.last_message_preview).toContain("onboarding steps");
  });

  it("attaches (idempotently) and detaches a real context document", async () => {
    const conv = await OsChatConversationModel.createConversation(userA, null);
    conversationIds.push(conv.id);

    await OsChatService.attachContext(conv.id, docId, userA);
    // Re-attach must not error or duplicate (composite PK + ignore).
    await OsChatService.attachContext(conv.id, docId, userA);
    let context = await OsChatContextDocumentModel.findByConversation(conv.id);
    expect(context).toHaveLength(1);
    expect(context[0]).toMatchObject({ document_id: docId, origin: "manual" });

    await OsChatService.detachContext(conv.id, docId, userA);
    context = await OsChatContextDocumentModel.findByConversation(conv.id);
    expect(context).toHaveLength(0);
  });

  it("scopes ownership: another user's conversation reads as not-found", async () => {
    const conv = await OsChatConversationModel.createConversation(userA, null);
    conversationIds.push(conv.id);

    await expect(
      OsChatService.getConversation(conv.id, userB)
    ).rejects.toMatchObject({ code: "OS_CONVERSATION_NOT_FOUND" });
    expect(await OsChatService.findOwnedConversation(conv.id, userB)).toBeNull();
  });

  it("delete cascades messages + context rows with the conversation", async () => {
    const conv = await OsChatConversationModel.createConversation(userA, null);
    await OsChatService.persistUserMessage(conv.id, "hi");
    await OsChatService.persistAssistantMessage(conv.id, "hello", []);
    await OsChatService.attachContext(conv.id, docId, userA);

    await OsChatService.deleteConversation(conv.id, userA);

    // Conversation gone…
    expect(
      await OsChatConversationModel.findConversationById(conv.id)
    ).toBeUndefined();
    // …and its messages + context rows cascaded away.
    const msgCount = await db.raw(
      `select count(*)::int as n from os.chat_messages where conversation_id = ?`,
      [conv.id]
    );
    expect(msgCount.rows[0].n).toBe(0);
    const ctxCount = await db.raw(
      `select count(*)::int as n from os.chat_context_documents where conversation_id = ?`,
      [conv.id]
    );
    expect(ctxCount.rows[0].n).toBe(0);
  });
});
