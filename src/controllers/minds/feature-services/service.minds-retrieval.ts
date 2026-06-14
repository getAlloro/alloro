import { MindBrainChunkModel, IMindBrainChunk } from "../../../models/MindBrainChunkModel";
import { generateEmbedding, generateEmbeddings } from "./service.minds-embedding";
import logger from "../../../lib/logger";

const RAG_THRESHOLD_CHARS = parseInt(process.env.MINDS_RAG_THRESHOLD_CHARS || "8000", 10);
const CHAT_TOP_K = parseInt(process.env.MINDS_RAG_CHAT_TOP_K || "7", 10);
const COMPARISON_TOP_K = parseInt(process.env.MINDS_RAG_COMPARISON_TOP_K || "15", 10);
const CHUNK_MAX_CHARS = parseInt(process.env.MINDS_CHUNK_MAX_CHARS || "2048", 10);

export interface RetrievalResult {
  chunks: Array<IMindBrainChunk & { similarity: number }>;
  summary: string;
  totalChunksSearched: number;
}

// =====================================================================
// THRESHOLD CHECK
// =====================================================================

export function shouldUseRag(brainCharCount: number): boolean {
  return brainCharCount >= RAG_THRESHOLD_CHARS;
}

// =====================================================================
// CHAT RETRIEVAL
// =====================================================================

export async function retrieveForChat(
  mindId: string,
  query: string,
  topK: number = CHAT_TOP_K
): Promise<RetrievalResult> {
  const queryEmbedding = await generateEmbedding(query);

  const [chunks, summaryChunk, totalChunks] = await Promise.all([
    MindBrainChunkModel.searchSimilar(mindId, queryEmbedding, topK),
    MindBrainChunkModel.getSummaryChunk(mindId),
    MindBrainChunkModel.countByMind(mindId),
  ]);

  const summary = summaryChunk?.chunk_text || "";

  logger.info(
    `[MINDS-RAG] Chat retrieval: query="${query.slice(0, 80)}..." → ${chunks.length} chunks (top similarity: ${chunks[0]?.similarity?.toFixed(3) || "N/A"})`
  );

  return { chunks, summary, totalChunksSearched: totalChunks };
}

// =====================================================================
// COMPARISON RETRIEVAL
// =====================================================================

export async function retrieveForComparison(
  mindId: string,
  scrapedContent: string,
  topK: number = COMPARISON_TOP_K
): Promise<RetrievalResult> {
  // For large scraped content, chunk it and search with multiple queries
  // then merge and deduplicate results
  const searchTexts: string[] = [];

  if (scrapedContent.length <= CHUNK_MAX_CHARS) {
    searchTexts.push(scrapedContent);
  } else {
    // Split scraped content into chunks for multi-query search
    const parts = scrapedContent.match(
      new RegExp(`.{1,${CHUNK_MAX_CHARS}}`, "gs")
    );
    if (parts) {
      // Use up to 5 chunks to search — balance between coverage and API calls
      searchTexts.push(...parts.slice(0, 5));
    }
  }

  // Generate embeddings for all search texts in batch
  const searchEmbeddings = await generateEmbeddings(searchTexts);

  // Search with each embedding and collect results
  const allChunks: Map<string, IMindBrainChunk & { similarity: number }> = new Map();

  for (const embedding of searchEmbeddings) {
    const results = await MindBrainChunkModel.searchSimilar(
      mindId,
      embedding,
      topK
    );

    for (const chunk of results) {
      const existing = allChunks.get(chunk.id);
      if (!existing || chunk.similarity > existing.similarity) {
        allChunks.set(chunk.id, chunk);
      }
    }
  }

  // Sort by similarity descending, take top-k
  const deduped = Array.from(allChunks.values())
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);

  const [summaryChunk, totalChunks] = await Promise.all([
    MindBrainChunkModel.getSummaryChunk(mindId),
    MindBrainChunkModel.countByMind(mindId),
  ]);

  const summary = summaryChunk?.chunk_text || "";

  logger.info(
    `[MINDS-RAG] Comparison retrieval: ${searchTexts.length} search queries → ${deduped.length} unique chunks`
  );

  return { chunks: deduped, summary, totalChunksSearched: totalChunks };
}

// =====================================================================
// CONTEXT BUILDER
// =====================================================================

export function buildRetrievedContext(
  chunks: Array<IMindBrainChunk & { similarity: number }>,
  summary: string
): string {
  const parts: string[] = [];

  // Summary always first
  if (summary) {
    parts.push(`KNOWLEDGE OVERVIEW:\n${summary}`);
  }

  // Group chunks by section heading
  const grouped: Map<string, string[]> = new Map();

  for (const chunk of chunks) {
    const heading = chunk.section_heading || "General";
    if (!grouped.has(heading)) {
      grouped.set(heading, []);
    }
    grouped.get(heading)!.push(chunk.chunk_text);
  }

  for (const [heading, texts] of grouped) {
    parts.push(`## ${heading}\n${texts.join("\n\n")}`);
  }

  return parts.join("\n\n---\n\n");
}
