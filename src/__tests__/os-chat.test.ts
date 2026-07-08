/**
 * Hermetic tests — OsChatService (P5 T1, plans/07042026-alloro-os-admin-port).
 *
 * Models + retrieval are mocked at the seam; the LLM is the injected fake
 * (§20.4). No live DB, no network. Proves the grounding contract that keeps chat
 * honest:
 *   - citations are assembled from the RETRIEVAL RESULT SET only (⊆ retrieved),
 *     never invented — a manual attachment cites the doc, a chunk cites its chunk
 *   - the refusal path: zero hits (nothing ≥ floor) ⇒ hasContent false ⇒ zero
 *     citations, and the controller persists an empty-source assistant message
 *   - history is oldest-first and windowed
 *   - auto-title fires once (only when the conversation has no title) and never
 *     throws out of the fire-and-forget path
 *
 * The live DB round-trip (persist + cascade) is proven in
 * src/integration-tests/os/p5-chat.itest.ts.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock the model + retrieval seams (hoisted; factories only) ────────────────
vi.mock("../models/OsChatConversationModel", () => ({
  OsChatConversationModel: {
    findConversationById: vi.fn(),
    createConversation: vi.fn(),
    listForUser: vi.fn(),
    updateTitle: vi.fn(async () => 1),
    deleteConversation: vi.fn(async () => 1),
  },
}));
vi.mock("../models/OsChatMessageModel", () => ({
  OsChatMessageModel: {
    createMessage: vi.fn(async () => ({ id: "msg-1" })),
    listForConversation: vi.fn(async () => []),
  },
}));
vi.mock("../models/OsChatContextDocumentModel", () => ({
  OsChatContextDocumentModel: {
    findByConversation: vi.fn(async () => []),
    attach: vi.fn(async () => undefined),
    detach: vi.fn(async () => 1),
  },
}));
vi.mock("../models/OsDocumentModel", () => ({
  OsDocumentModel: { findDocumentById: vi.fn() },
}));
vi.mock("../models/OsDocumentVersionModel", () => ({
  OsDocumentVersionModel: { findVersionById: vi.fn() },
}));
vi.mock("../controllers/admin-os/feature-services/OsRetrievalService", () => ({
  OsRetrievalService: { retrieve: vi.fn(async () => []) },
}));

import { OsChatService } from "../controllers/admin-os/feature-services/OsChatService";
import {
  OsFakeLlmProvider,
  setOsLlmProvider,
} from "../controllers/admin-os/feature-services/service.os-llm";
import { OsChatConversationModel } from "../models/OsChatConversationModel";
import { OsChatMessageModel } from "../models/OsChatMessageModel";
import { OsChatContextDocumentModel } from "../models/OsChatContextDocumentModel";
import { OsDocumentModel } from "../models/OsDocumentModel";
import { OsDocumentVersionModel } from "../models/OsDocumentVersionModel";
import { OsRetrievalService } from "../controllers/admin-os/feature-services/OsRetrievalService";
import type { IOsChunkSearchHit } from "../models/OsDocumentChunkModel";

const CONV_ID = "0b6ff26e-3a5e-4d2b-9d3c-000000000abc";
const USER_ID = 7;

const chunkHit = (
  overrides: Partial<IOsChunkSearchHit> = {}
): IOsChunkSearchHit => ({
  document_id: "11111111-1111-1111-1111-111111111111",
  title: "Runbook",
  slug: "runbook",
  version_no: 3,
  chunk_index: 2,
  heading_path: "Setup > Install",
  content: "Install the widget by running the installer script.",
  similarity: 0.81,
  ...overrides,
});

async function collect(stream: AsyncIterable<string>): Promise<string> {
  let out = "";
  for await (const token of stream) out += token;
  return out;
}

beforeEach(() => {
  vi.clearAllMocks();
  setOsLlmProvider(new OsFakeLlmProvider());
  vi.mocked(OsChatContextDocumentModel.findByConversation).mockResolvedValue([]);
  vi.mocked(OsChatMessageModel.listForConversation).mockResolvedValue([]);
  vi.mocked(OsRetrievalService.retrieve).mockResolvedValue([]);
});

describe("OsChatService.buildContext — citations from the retrieval set only", () => {
  it("builds one citation per retrieved chunk, matching its chunk fields", async () => {
    vi.mocked(OsRetrievalService.retrieve).mockResolvedValue([
      chunkHit(),
      chunkHit({
        document_id: "22222222-2222-2222-2222-222222222222",
        chunk_index: 0,
        heading_path: null,
      }),
    ]);

    const { citations, hasContent, contextText } =
      await OsChatService.buildContext(CONV_ID, "how do I install");

    expect(hasContent).toBe(true);
    expect(citations).toEqual([
      {
        document_id: "11111111-1111-1111-1111-111111111111",
        version_no: 3,
        chunk_index: 2,
        heading_path: "Setup > Install",
      },
      {
        document_id: "22222222-2222-2222-2222-222222222222",
        version_no: 3,
        chunk_index: 0,
        heading_path: null,
      },
    ]);
    // Context text is assembled from the hits (evidence the model will ground on).
    expect(contextText).toContain("Install the widget");
  });

  it("cites a manual attachment as a whole-document citation (chunk_index null)", async () => {
    vi.mocked(OsChatContextDocumentModel.findByConversation).mockResolvedValue([
      { conversation_id: CONV_ID, document_id: "doc-a", origin: "manual" },
    ]);
    vi.mocked(OsDocumentModel.findDocumentById).mockResolvedValue({
      id: "doc-a",
      title: "Onboarding",
      archived_at: null,
      current_version_id: "ver-a",
    } as never);
    vi.mocked(OsDocumentVersionModel.findVersionById).mockResolvedValue({
      version_no: 5,
      content_md: "Full onboarding text.",
    } as never);

    const { citations } = await OsChatService.buildContext(CONV_ID, "onboarding?");

    expect(citations).toEqual([
      {
        document_id: "doc-a",
        version_no: 5,
        chunk_index: null,
        heading_path: "Onboarding",
      },
    ]);
  });

  it("refusal path: zero hits ⇒ empty context, no citations, hasContent false", async () => {
    vi.mocked(OsRetrievalService.retrieve).mockResolvedValue([]);

    const { citations, hasContent, contextText } =
      await OsChatService.buildContext(CONV_ID, "unrelated question");

    expect(citations).toEqual([]);
    expect(hasContent).toBe(false);
    expect(contextText).toBe("");
  });
});

describe("OsChatService.streamAnswer — grounded vs refusal", () => {
  it("streams a grounded answer when context is present", async () => {
    const answer = await collect(
      OsChatService.streamAnswer("Knowledge base evidence here.", [], "q")
    );
    expect(answer).toContain("Based on the knowledge base");
    expect(answer).toContain("evidence here");
  });

  it("streams an honest refusal when context is empty", async () => {
    const answer = await collect(OsChatService.streamAnswer("", [], "q"));
    expect(answer.toLowerCase()).toContain("couldn't find");
  });
});

describe("OsChatService.history — order + window", () => {
  it("returns the last turns oldest-first as role/content", async () => {
    vi.mocked(OsChatMessageModel.listForConversation).mockResolvedValue([
      { role: "user", content: "first" },
      { role: "assistant", content: "reply one" },
      { role: "user", content: "second" },
    ] as never);

    const history = await OsChatService.history(CONV_ID);

    expect(history).toEqual([
      { role: "user", content: "first" },
      { role: "assistant", content: "reply one" },
      { role: "user", content: "second" },
    ]);
  });

  it("windows to the most recent 6 turns", async () => {
    const many = Array.from({ length: 10 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `turn ${i}`,
    }));
    vi.mocked(OsChatMessageModel.listForConversation).mockResolvedValue(
      many as never
    );

    const history = await OsChatService.history(CONV_ID);

    expect(history).toHaveLength(6);
    expect(history[0]).toEqual({ role: "user", content: "turn 4" });
    expect(history[5]).toEqual({ role: "assistant", content: "turn 9" });
  });
});

describe("OsChatService.maybeAutoTitle — fires once, never throws", () => {
  it("titles an untitled conversation from the first message (truncated)", async () => {
    vi.mocked(OsChatConversationModel.findConversationById).mockResolvedValue({
      id: CONV_ID,
      user_id: USER_ID,
      title: null,
      created_at: new Date(),
    });

    await OsChatService.maybeAutoTitle(
      CONV_ID,
      "  How do I configure the ingest worker for a new document type?  "
    );

    expect(OsChatConversationModel.updateTitle).toHaveBeenCalledTimes(1);
    const [, title] = vi.mocked(OsChatConversationModel.updateTitle).mock
      .calls[0];
    // Trimmed first message, sliced to the 60-char title cap.
    expect(title).toBe("How do I configure the ingest worker for a new document type");
    expect((title as string).length).toBe(60);
  });

  it("does NOT retitle a conversation that already has a title", async () => {
    vi.mocked(OsChatConversationModel.findConversationById).mockResolvedValue({
      id: CONV_ID,
      user_id: USER_ID,
      title: "Existing title",
      created_at: new Date(),
    });

    await OsChatService.maybeAutoTitle(CONV_ID, "another message");

    expect(OsChatConversationModel.updateTitle).not.toHaveBeenCalled();
  });

  it("swallows a lookup failure (fire-and-forget must never reject)", async () => {
    vi.mocked(OsChatConversationModel.findConversationById).mockRejectedValue(
      new Error("db down")
    );

    await expect(
      OsChatService.maybeAutoTitle(CONV_ID, "message")
    ).resolves.toBeUndefined();
    expect(OsChatConversationModel.updateTitle).not.toHaveBeenCalled();
  });
});

describe("OsChatService ownership — not-yours reads as not-found", () => {
  it("getConversation throws OS_CONVERSATION_NOT_FOUND for another user's thread", async () => {
    vi.mocked(OsChatConversationModel.findConversationById).mockResolvedValue({
      id: CONV_ID,
      user_id: 999, // owned by someone else
      title: null,
      created_at: new Date(),
    });

    await expect(
      OsChatService.getConversation(CONV_ID, USER_ID)
    ).rejects.toMatchObject({ code: "OS_CONVERSATION_NOT_FOUND" });
  });

  it("findOwnedConversation returns null when the caller is not the owner", async () => {
    vi.mocked(OsChatConversationModel.findConversationById).mockResolvedValue({
      id: CONV_ID,
      user_id: 999,
      title: null,
      created_at: new Date(),
    });

    const owned = await OsChatService.findOwnedConversation(CONV_ID, USER_ID);
    expect(owned).toBeNull();
  });
});
