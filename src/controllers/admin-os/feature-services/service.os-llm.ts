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

export interface OsLlmProvider {
  /** AI taxonomy for one document — summary (≤2 sentences), category, tags. */
  generateDocMetadata(title: string, contentMd: string): Promise<OsDocMetadata>;
}

/** Caps (§4.2): prompt content slice, reply budget, tag count, summary length. */
const OS_METADATA_CONTENT_SLICE = 8000;
const OS_METADATA_MAX_OUTPUT_TOKENS = 500;
const OS_METADATA_MAX_TAGS = 6;
const OS_FALLBACK_SUMMARY_MAX = 280;
const OS_FALLBACK_CATEGORY = "Uncategorized";

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
}

/** Deterministic, key-free fake (§20.4) — the title-fallback shape. */
export class OsFakeLlmProvider implements OsLlmProvider {
  async generateDocMetadata(
    title: string,
    contentMd: string
  ): Promise<OsDocMetadata> {
    return deriveOsTitleFallbackMetadata(title, contentMd);
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
