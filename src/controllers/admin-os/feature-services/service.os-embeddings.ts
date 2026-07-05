/**
 * Embedding provider seam for the OS knowledge base (plans/07042026-alloro-
 * os-admin-port, P4 T1; master spec D6). One interface, two implementations:
 *
 *  - OsOpenAiEmbeddingProvider — the house axios pattern (analog:
 *    controllers/minds/feature-services/service.minds-embedding.ts): batched
 *    POST to the OpenAI embeddings endpoint with the config-driven model,
 *    every returned vector asserted against the config dimension (a silent
 *    dimension drift would corrupt the vector(1536) column).
 *  - OsFakeEmbeddingProvider — deterministic sha256-based unit vectors
 *    (ported from alloro-os/backend/src/lib/embeddings.ts) so ingest and
 *    retrieval are provable with no key and no network (§20.4).
 *
 * Selection is by INJECTION only — tests call setOsEmbeddingProvider(fake);
 * there is no env/NODE_ENV switch (repo rule: uniform runtime behavior).
 */

import crypto from "crypto";
import axios from "axios";
import { getOsKnowledgeBaseConfig } from "../../../config/osKnowledgeBase";

export interface OsEmbeddingProvider {
  /** Embed texts in order — result[i] is the vector for texts[i]. */
  embed(texts: string[]): Promise<number[][]>;
}

const OPENAI_EMBEDDINGS_URL = "https://api.openai.com/v1/embeddings";
/** Inputs per OpenAI request — bounds request payloads; batches run in order. */
const OS_EMBEDDING_BATCH_SIZE = 128;
/** sha256 emits 32 bytes; the fake vector re-hashes per 32-value block. */
const SHA256_BLOCK_BYTES = 32;

function getOpenAiKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error("[ADMIN-OS] OPENAI_API_KEY is not set — cannot embed.");
  }
  return key;
}

export class OsOpenAiEmbeddingProvider implements OsEmbeddingProvider {
  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const config = getOsKnowledgeBaseConfig();

    const vectors: number[][] = [];
    for (let start = 0; start < texts.length; start += OS_EMBEDDING_BATCH_SIZE) {
      const batch = texts.slice(start, start + OS_EMBEDDING_BATCH_SIZE);
      const response = await axios.post(
        OPENAI_EMBEDDINGS_URL,
        { model: config.embeddingModel, input: batch },
        {
          headers: {
            Authorization: `Bearer ${getOpenAiKey()}`,
            "Content-Type": "application/json",
          },
        }
      );
      // OpenAI may return rows out of order — restore input order by index.
      const sorted = (
        response.data.data as Array<{ index: number; embedding: number[] }>
      ).sort((a, b) => a.index - b.index);
      for (const row of sorted) vectors.push(row.embedding);
    }

    if (vectors.length !== texts.length) {
      throw new Error(
        `[ADMIN-OS] Embedding count mismatch: sent ${texts.length} inputs, got ${vectors.length} vectors.`
      );
    }
    for (const vector of vectors) {
      if (vector.length !== config.embeddingDim) {
        throw new Error(
          `[ADMIN-OS] Embedding dimension mismatch: model "${config.embeddingModel}" returned ` +
            `${vector.length}, but os.document_chunks.embedding is vector(${config.embeddingDim}).`
        );
      }
    }
    return vectors;
  }
}

/**
 * Deterministic fake: same text → same unit vector, at the configured
 * dimension. Similar enough to real embeddings for pipeline tests: identical
 * texts have cosine similarity 1.0; unrelated texts land near 0.
 */
function fakeUnitVector(text: string, dimension: number): number[] {
  const vector = new Array<number>(dimension).fill(0);
  let block = crypto.createHash("sha256").update(text).digest();
  for (let i = 0; i < dimension; i++) {
    if (i % SHA256_BLOCK_BYTES === 0 && i > 0) {
      block = crypto.createHash("sha256").update(block).digest();
    }
    vector[i] = (block[i % SHA256_BLOCK_BYTES] / 255) * 2 - 1;
  }
  const norm = Math.sqrt(vector.reduce((sum, x) => sum + x * x, 0)) || 1;
  return vector.map((x) => x / norm);
}

export class OsFakeEmbeddingProvider implements OsEmbeddingProvider {
  async embed(texts: string[]): Promise<number[][]> {
    const { embeddingDim } = getOsKnowledgeBaseConfig();
    return texts.map((text) => fakeUnitVector(text, embeddingDim));
  }
}

let injectedProvider: OsEmbeddingProvider | null = null;
let defaultProvider: OsEmbeddingProvider | null = null;

/** Test seam (§20.4): inject a fake; pass null to restore the real provider. */
export function setOsEmbeddingProvider(
  provider: OsEmbeddingProvider | null
): void {
  injectedProvider = provider;
}

/** The active provider — injected fake in tests, OpenAI otherwise. */
export function getOsEmbeddingProvider(): OsEmbeddingProvider {
  if (injectedProvider) return injectedProvider;
  if (!defaultProvider) defaultProvider = new OsOpenAiEmbeddingProvider();
  return defaultProvider;
}
