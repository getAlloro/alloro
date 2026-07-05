/**
 * LLM provider seam for the OS knowledge base (plans/07042026-alloro-os-
 * admin-port, P4 T1; master spec D7). Gemini via the installed @google/genai
 * 1.43 API surface — new GoogleGenAI({ apiKey }) → client.models.
 * generateContent({ model, contents, config }) → response.text — verified
 * against node_modules/@google/genai/dist/genai.d.ts. Everything Gemini is
 * isolated behind this ONE file so a provider swap is a one-file change; the
 * P5 chat stream method joins this seam later.
 *
 * P4 scope: generateDocMetadata (summary/category/tags as strict JSON, zod-
 * parsed, ONE retry on a malformed reply) + the busy-error classifier the
 * ingest fallback and P5 chat both use. Metadata failure NEVER fails ingest —
 * OsIngestService degrades to deriveOsTitleFallbackMetadata (the exact
 * behavior of the OS IngestService's safeDocIndex).
 *
 * P5 scope (chat): streamChat — a token async-iterable over Gemini's
 * generateContentStream (verified in node_modules/@google/genai/dist/
 * genai.d.ts: models.generateContentStream(params) => Promise<AsyncGenerator<
 * GenerateContentResponse>>, each chunk exposing a `text` getter). The
 * grounded-refusal persona (CHAT_SYSTEM) answers only from retrieved context,
 * cites only chunks it used, and plainly says so when nothing relevant exists.
 * The stream-open await gets a bounded busy retry; a mid-iteration failure is
 * NOT retried (it would re-yield already-sent tokens). OsFakeLlmProvider yields
 * a deterministic, key-free reply so tests + itests never touch the network.
 *
 * Selection is by INJECTION only — tests call setOsLlmProvider(fake); no
 * env/NODE_ENV switches (repo rule: uniform runtime behavior).
 */

import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import logger from "../../../lib/logger";
import { getOsKnowledgeBaseConfig } from "../../../config/osKnowledgeBase";

export interface OsDocMetadata {
  summary: string;
  category: string;
  tags: string[];
}

/** One prior turn of a chat, in provider-neutral form. */
export interface OsChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface OsLlmProvider {
  /** AI taxonomy for one document — summary (≤2 sentences), category, tags. */
  generateDocMetadata(title: string, contentMd: string): Promise<OsDocMetadata>;
  /**
   * Grounded RAG answer as a token stream. `context` is the assembled
   * knowledge-base evidence (empty string ⇒ no relevant docs → an honest
   * refusal); `history` is the prior turns (excluding the current question);
   * `question` is the latest user message. Yields answer tokens in order.
   */
  streamChat(
    context: string,
    history: OsChatTurn[],
    question: string
  ): AsyncIterable<string>;
}

/** Caps (§4.2): prompt content slice, reply budget, tag count, summary length. */
const OS_METADATA_CONTENT_SLICE = 8000;
const OS_METADATA_MAX_OUTPUT_TOKENS = 500;
const OS_METADATA_MAX_TAGS = 6;
const OS_FALLBACK_SUMMARY_MAX = 280;
const OS_FALLBACK_CATEGORY = "Uncategorized";

/** Chat caps + stream-open retry policy (§4.2). */
const OS_CHAT_MAX_OUTPUT_TOKENS = 1024;
const OS_CHAT_MAX_STREAM_ATTEMPTS = 3;
const OS_CHAT_RETRY_BASE_DELAY_MS = 600;

/**
 * Grounded-refusal persona for OS chat (master spec: "answer only from
 * retrieved context; cite only chunks actually used; say so plainly when
 * nothing relevant exists"). Stricter than the alloro-os CHAT_SYSTEM (which
 * allowed in-domain expertise) — the OS admin KB wants sourced answers, so an
 * empty context is an honest no-answer, never an unsourced guess.
 */
const OS_CHAT_SYSTEM_PROMPT = `You are the assistant inside Alloro OS — the Alloro team's internal knowledge base. Answer questions using ONLY the knowledge-base context provided with each question.

How to answer:
- Ground every claim in the provided context and attribute it to the documents it came from. Prefer the documented answer; do not add outside facts.
- Follow-ups ("expand on that", "what about step 3?") refer to the earlier turns — continue the conversation naturally, still grounded in the context.
- When the provided context does not contain the answer, say so plainly in one or two sentences (for example: "I couldn't find anything about that in the knowledge base."). Do not guess, do not answer from general knowledge, and do not invent document contents or citations.

Be clear and practical. Never fabricate facts, figures, or sources.`;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const OS_METADATA_SYSTEM_PROMPT =
  "You index documents for an internal knowledge base. Reply with ONLY minified JSON: " +
  '{"summary": string (<=2 sentences), "category": string, "tags": string[] (3-6 lowercase)}.';

const osDocMetadataSchema = z.object({
  summary: z.string().min(1),
  category: z.string().min(1),
  tags: z.array(z.string()),
});

/**
 * 429/503 — the "model is busy" family (rate limit / high demand). Exported so
 * callers classify a failure without re-implementing the check: the ingest
 * fallback logs it (§21.4 context) and the P5 chat controller maps it to a
 * friendly try-again message.
 */
export function isOsModelBusyError(error: unknown): boolean {
  if (error && typeof error === "object" && "status" in error) {
    const status = (error as { status: unknown }).status;
    return status === 429 || status === 503;
  }
  return false;
}

/**
 * Title-based metadata used when the model is unavailable or unparsable:
 * summary = first non-heading content line (or the title), Uncategorized, no
 * tags. Shared by the ingest degrade path and the fake provider so tests and
 * runtime agree on the exact fallback shape.
 */
export function deriveOsTitleFallbackMetadata(
  title: string,
  contentMd: string
): OsDocMetadata {
  const firstLine = contentMd
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("#"));
  return {
    summary: (firstLine ?? title).slice(0, OS_FALLBACK_SUMMARY_MAX),
    category: OS_FALLBACK_CATEGORY,
    tags: [],
  };
}

/** Pull the outermost {...} slice out of a model reply and zod-validate it. */
function parseMetadataReply(raw: string): OsDocMetadata | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
  const result = osDocMetadataSchema.safeParse(parsed);
  if (!result.success) return null;
  return {
    summary: result.data.summary,
    category: result.data.category,
    tags: result.data.tags
      .filter((tag) => tag.trim().length > 0)
      .slice(0, OS_METADATA_MAX_TAGS),
  };
}

export class OsGeminiLlmProvider implements OsLlmProvider {
  private client: GoogleGenAI | null = null;

  private getClient(): GoogleGenAI {
    if (!this.client) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error(
          "[ADMIN-OS] GEMINI_API_KEY is not set — cannot generate AI metadata."
        );
      }
      this.client = new GoogleGenAI({ apiKey });
    }
    return this.client;
  }

  private async generateOnce(title: string, contentMd: string): Promise<string> {
    const config = getOsKnowledgeBaseConfig();
    const response = await this.getClient().models.generateContent({
      model: config.chatModel,
      contents: `Title: ${title}\n\n${contentMd.slice(0, OS_METADATA_CONTENT_SLICE)}`,
      config: {
        systemInstruction: OS_METADATA_SYSTEM_PROMPT,
        maxOutputTokens: OS_METADATA_MAX_OUTPUT_TOKENS,
        // Skip the hidden "thinking" pass — metadata is a small structured task.
        thinkingConfig: { thinkingBudget: 0 },
      },
    });
    return response.text ?? "";
  }

  async generateDocMetadata(
    title: string,
    contentMd: string
  ): Promise<OsDocMetadata> {
    const firstReply = await this.generateOnce(title, contentMd);
    const firstParse = parseMetadataReply(firstReply);
    if (firstParse) return firstParse;

    // ONE retry on a malformed reply (truncated/wrapped JSON); a second
    // failure throws so the caller applies the title fallback.
    logger.warn(
      { title },
      "[ADMIN-OS] doc-metadata reply was not valid JSON — retrying once"
    );
    const secondReply = await this.generateOnce(title, contentMd);
    const secondParse = parseMetadataReply(secondReply);
    if (secondParse) return secondParse;
    throw new Error(
      "[ADMIN-OS] doc-metadata reply was malformed twice — giving up."
    );
  }

  /**
   * Open the token stream with a bounded busy retry (429/503) BEFORE any token
   * is yielded — a mid-iteration retry would re-emit already-sent tokens, so it
   * is deliberately not retried. Maps chat history to Gemini's roles (assistant
   * → "model"); the final user turn embeds the grounded/refusal instruction.
   */
  private async openChatStream(
    context: string,
    history: OsChatTurn[],
    question: string
  ): Promise<AsyncIterable<{ text?: string }>> {
    const config = getOsKnowledgeBaseConfig();
    const hasContext = context.trim().length > 0;
    const finalText = hasContext
      ? `Knowledge-base context for this question:\n\n${context}\n\nUsing only the context above, and citing the documents you draw from, answer:\n\n${question}`
      : `No knowledge-base documents matched this question. Tell the user plainly that you could not find anything about it in the knowledge base. Do not answer from general knowledge.\n\nQuestion: ${question}`;
    const contents = [
      ...history.map((turn) => ({
        role: turn.role === "assistant" ? "model" : "user",
        parts: [{ text: turn.content }],
      })),
      { role: "user", parts: [{ text: finalText }] },
    ];

    let lastError: unknown;
    for (let attempt = 1; attempt <= OS_CHAT_MAX_STREAM_ATTEMPTS; attempt++) {
      try {
        return await this.getClient().models.generateContentStream({
          model: config.chatModel,
          contents,
          config: {
            systemInstruction: OS_CHAT_SYSTEM_PROMPT,
            maxOutputTokens: OS_CHAT_MAX_OUTPUT_TOKENS,
            // Skip the hidden "thinking" pass so the first token streams sooner.
            thinkingConfig: { thinkingBudget: 0 },
          },
        });
      } catch (error) {
        lastError = error;
        if (!isOsModelBusyError(error) || attempt === OS_CHAT_MAX_STREAM_ATTEMPTS) {
          throw error;
        }
        const delay = OS_CHAT_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
        logger.warn(
          { attempt, delay },
          "[ADMIN-OS] chat stream busy — retrying stream open"
        );
        await sleep(delay);
      }
    }
    throw lastError;
  }

  async *streamChat(
    context: string,
    history: OsChatTurn[],
    question: string
  ): AsyncIterable<string> {
    const stream = await this.openChatStream(context, history, question);
    for await (const chunk of stream) {
      const delta = chunk.text;
      if (delta) yield delta;
    }
  }
}

/** Deterministic, key-free fake (§20.4) — the title-fallback shape. */
export class OsFakeLlmProvider implements OsLlmProvider {
  async generateDocMetadata(
    title: string,
    contentMd: string
  ): Promise<OsDocMetadata> {
    return deriveOsTitleFallbackMetadata(title, contentMd);
  }

  /**
   * Deterministic chat reply. With context: a grounded acknowledgement + a
   * whitespace-collapsed snippet of the evidence. Without context: the honest
   * refusal line — so the empty-retrieval path is provable without a network
   * call. Yielded in three chunks to exercise multi-delta stream handling.
   */
  async *streamChat(
    context: string,
    _history: OsChatTurn[],
    _question: string
  ): AsyncIterable<string> {
    if (!context.trim()) {
      yield "I couldn't find anything about that in the knowledge base.";
      return;
    }
    const snippet = context.slice(0, 400).replace(/\s+/g, " ").trim();
    yield "Based on the knowledge base: ";
    yield snippet;
    yield " (dev fake — set GEMINI_API_KEY for real grounded answers).";
  }
}

let injectedProvider: OsLlmProvider | null = null;
let defaultProvider: OsLlmProvider | null = null;

/** Test seam (§20.4): inject a fake; pass null to restore the real provider. */
export function setOsLlmProvider(provider: OsLlmProvider | null): void {
  injectedProvider = provider;
}

/** The active provider — injected fake in tests, Gemini otherwise. */
export function getOsLlmProvider(): OsLlmProvider {
  if (injectedProvider) return injectedProvider;
  if (!defaultProvider) defaultProvider = new OsGeminiLlmProvider();
  return defaultProvider;
}
