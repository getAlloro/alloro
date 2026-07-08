/**
 * Supertest — OS chat SSE endpoint (P5 T2, plans/07042026-alloro-os-admin-port;
 * analog: os-routes.smoke.test.ts). Runs the REAL middleware stack (default-deny
 * → authenticateToken → superAdminMiddleware, §11.1) and the REAL controller;
 * OsChatService is mocked at the seam so no DB/network is touched.
 *
 * Proves:
 *   - the SSE event sequence: status → delta(s) → done{message_id,citations}
 *   - a mid-flight stream failure arrives as an in-stream error event (never an
 *     envelope once headers are sent, §8.3)
 *   - the auth matrix on the SSE route: 401 no-token, 403 non-super-admin
 *   - a bad payload 400s as the §8.1 envelope BEFORE the stream opens
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

// ── Mock the service seam (hoisted; factory only) ─────────────────────────────
vi.mock("../controllers/admin-os/feature-services/OsChatService", () => ({
  OsChatService: {
    findOwnedConversation: vi.fn(),
    persistUserMessage: vi.fn(async () => ({ id: "user-msg" })),
    maybeAutoTitle: vi.fn(async () => undefined),
    history: vi.fn(async () => []),
    buildContext: vi.fn(async () => ({
      contextText: "evidence",
      citations: [],
      hasContent: false,
    })),
    streamAnswer: vi.fn(),
    persistAssistantMessage: vi.fn(async () => ({ id: "assistant-msg" })),
  },
}));

import { app } from "./helpers/app";
import { authHeader, superAdminAuthHeader } from "./helpers/auth";
import { OsChatService } from "../controllers/admin-os/feature-services/OsChatService";
import type { IOsChatCitation } from "../models/OsChatMessageModel";

const CONV_ID = "0b6ff26e-3a5e-4d2b-9d3c-000000000abc";
const MESSAGES_PATH = `/api/admin/os/chat/conversations/${CONV_ID}/messages`;

/** Parse a buffered SSE body into its decoded `data:` event objects. */
function parseSseEvents(body: string): Array<Record<string, unknown>> {
  return body
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("data:"))
    .map((line) => JSON.parse(line.slice(5).trim()));
}

async function* tokenStream(tokens: string[]): AsyncIterable<string> {
  for (const token of tokens) yield token;
}

// eslint-disable-next-line require-yield
async function* throwingStream(): AsyncIterable<string> {
  throw new Error("model exploded mid-stream");
}

const ownedConversation = {
  id: CONV_ID,
  user_id: 1,
  title: null,
  created_at: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(OsChatService.findOwnedConversation).mockResolvedValue(
    ownedConversation
  );
  vi.mocked(OsChatService.history).mockResolvedValue([]);
  vi.mocked(OsChatService.buildContext).mockResolvedValue({
    contextText: "evidence",
    citations: [],
    hasContent: false,
  });
});

describe("POST /api/admin/os/chat/conversations/:id/messages — auth matrix", () => {
  it("returns 401 without a token (default-deny guard)", async () => {
    const res = await request(app)
      .post(MESSAGES_PATH)
      .send({ message: "hello" });
    expect(res.status).toBe(401);
  });

  it("returns 403 for an authenticated non-super-admin token", async () => {
    const res = await request(app)
      .post(MESSAGES_PATH)
      .set(authHeader({ email: "not-an-admin@test.alloro" }))
      .send({ message: "hello" });
    expect(res.status).toBe(403);
  });
});

describe("POST …/messages — pre-stream validation (envelope, before headers)", () => {
  it("400s with the §8.1 envelope on an empty message", async () => {
    const res = await request(app)
      .post(MESSAGES_PATH)
      .set(superAdminAuthHeader())
      .send({ message: "   " });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      success: false,
      data: null,
      error: { code: "OS_CHAT_MESSAGE_REQUIRED" },
    });
    // Never reached the stream.
    expect(OsChatService.streamAnswer).not.toHaveBeenCalled();
  });

  it("404s (envelope) when the conversation is not owned by the caller", async () => {
    vi.mocked(OsChatService.findOwnedConversation).mockResolvedValue(null);

    const res = await request(app)
      .post(MESSAGES_PATH)
      .set(superAdminAuthHeader())
      .send({ message: "hello" });

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({
      success: false,
      error: { code: "OS_CONVERSATION_NOT_FOUND" },
    });
  });
});

describe("POST …/messages — SSE stream", () => {
  it("emits status → delta(s) → done with server-built citations", async () => {
    const citations: IOsChatCitation[] = [
      {
        document_id: "11111111-1111-1111-1111-111111111111",
        version_no: 2,
        chunk_index: 0,
        heading_path: "Setup",
      },
    ];
    vi.mocked(OsChatService.buildContext).mockResolvedValue({
      contextText: "grounding evidence",
      citations,
      hasContent: true,
    });
    vi.mocked(OsChatService.streamAnswer).mockReturnValue(
      tokenStream(["Hello", " world"])
    );

    const res = await request(app)
      .post(MESSAGES_PATH)
      .set(superAdminAuthHeader())
      .send({ message: "how do I set up?" });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/event-stream");

    const events = parseSseEvents(res.text);
    const statuses = events.filter((e) => "status" in e);
    const deltas = events.filter((e) => "delta" in e);
    const done = events.find((e) => "done" in e);

    // At least the searching + composing status lines, in order, before tokens.
    expect(statuses.length).toBeGreaterThanOrEqual(2);
    expect(deltas.map((d) => d.delta)).toEqual(["Hello", " world"]);
    expect(done).toMatchObject({
      done: true,
      message_id: "assistant-msg",
      citations,
    });
    // The assistant message was persisted with the accumulated full text.
    expect(OsChatService.persistAssistantMessage).toHaveBeenCalledWith(
      CONV_ID,
      "Hello world",
      citations
    );
  });

  it("persists NO citations on the refusal path (empty retrieval)", async () => {
    vi.mocked(OsChatService.buildContext).mockResolvedValue({
      contextText: "",
      citations: [],
      hasContent: false,
    });
    vi.mocked(OsChatService.streamAnswer).mockReturnValue(
      tokenStream(["I couldn't find anything about that."])
    );

    const res = await request(app)
      .post(MESSAGES_PATH)
      .set(superAdminAuthHeader())
      .send({ message: "unrelated" });

    const done = parseSseEvents(res.text).find((e) => "done" in e);
    expect(done).toMatchObject({ done: true, citations: [] });
    expect(OsChatService.persistAssistantMessage).toHaveBeenCalledWith(
      CONV_ID,
      "I couldn't find anything about that.",
      []
    );
  });

  it("surfaces a mid-flight stream failure as an in-stream error event", async () => {
    vi.mocked(OsChatService.buildContext).mockResolvedValue({
      contextText: "evidence",
      citations: [],
      hasContent: false,
    });
    vi.mocked(OsChatService.streamAnswer).mockReturnValue(throwingStream());

    const res = await request(app)
      .post(MESSAGES_PATH)
      .set(superAdminAuthHeader())
      .send({ message: "trigger a failure" });

    // Headers were already sent → status stays 200 and the error rides the stream.
    expect(res.status).toBe(200);
    const events = parseSseEvents(res.text);
    const errorEvent = events.find((e) => "error" in e);
    expect(errorEvent).toMatchObject({ error: "chat_failed" });
    // A failed stream must not persist a (partial) assistant message.
    expect(OsChatService.persistAssistantMessage).not.toHaveBeenCalled();
  });
});
