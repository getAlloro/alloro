import axios from "axios";
import Anthropic from "@anthropic-ai/sdk";
import logger from "../../../lib/logger";

const EMBEDDING_MODEL = process.env.MINDS_EMBEDDING_MODEL || "text-embedding-3-small";
const CHUNK_MAX_CHARS = parseInt(process.env.MINDS_CHUNK_MAX_CHARS || "2048", 10);
const CHUNK_OVERLAP_CHARS = parseInt(process.env.MINDS_CHUNK_OVERLAP_CHARS || "150", 10);
const LLM_MODEL = process.env.MINDS_LLM_MODEL || "claude-sonnet-4-6";

let anthropicClient: Anthropic | null = null;

function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    anthropicClient = new Anthropic();
  }
  return anthropicClient;
}

function getOpenAIKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not set");
  return key;
}

// =====================================================================
// EMBEDDING GENERATION
// =====================================================================

export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await axios.post(
    "https://api.openai.com/v1/embeddings",
    { model: EMBEDDING_MODEL, input: text },
    {
      headers: {
        Authorization: `Bearer ${getOpenAIKey()}`,
        "Content-Type": "application/json",
      },
    }
  );
  return response.data.data[0].embedding;
}

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  // OpenAI supports batch embedding in a single call
  const response = await axios.post(
    "https://api.openai.com/v1/embeddings",
    { model: EMBEDDING_MODEL, input: texts },
    {
      headers: {
        Authorization: `Bearer ${getOpenAIKey()}`,
        "Content-Type": "application/json",
      },
    }
  );

  // Sort by index to maintain order
  const sorted = response.data.data.sort(
    (a: { index: number }, b: { index: number }) => a.index - b.index
  );
  return sorted.map((d: { embedding: number[] }) => d.embedding);
}

// =====================================================================
// MARKDOWN-AWARE CHUNKING
// =====================================================================

export interface BrainChunk {
  text: string;
  index: number;
  sectionHeading: string | null;
  charCount: number;
}

export function chunkBrainMarkdown(markdown: string): BrainChunk[] {
  if (!markdown || markdown.trim().length === 0) return [];

  const chunks: BrainChunk[] = [];
  let chunkIndex = 0;

  // Split by ## headings (keeping the heading with its content)
  const sections = splitBySections(markdown);

  for (const section of sections) {
    const heading = section.heading;
    const content = section.content.trim();

    if (!content) continue;

    if (content.length <= CHUNK_MAX_CHARS) {
      // Section fits in one chunk
      chunks.push({
        text: content,
        index: chunkIndex++,
        sectionHeading: heading,
        charCount: content.length,
      });
    } else {
      // Section too large — sub-split by paragraph/sentence/word
      const subChunks = splitLargeSection(content, heading);
      for (const sub of subChunks) {
        chunks.push({
          ...sub,
          index: chunkIndex++,
        });
      }
    }
  }

  // Add overlap between adjacent chunks within the same section
  return addOverlap(chunks);
}

interface Section {
  heading: string | null;
  content: string;
}

function splitBySections(markdown: string): Section[] {
  const lines = markdown.split("\n");
  const sections: Section[] = [];
  let currentHeading: string | null = null;
  let currentLines: string[] = [];

  for (const line of lines) {
    // Match ## headings (level 2 and 3)
    const headingMatch = line.match(/^(#{2,3})\s+(.+)$/);

    if (headingMatch) {
      // Save previous section
      if (currentLines.length > 0) {
        sections.push({
          heading: currentHeading,
          content: currentLines.join("\n"),
        });
      }
      currentHeading = headingMatch[2].trim();
      currentLines = [line];
    } else {
      currentLines.push(line);
    }
  }

  // Save last section
  if (currentLines.length > 0) {
    sections.push({
      heading: currentHeading,
      content: currentLines.join("\n"),
    });
  }

  return sections;
}

function splitLargeSection(content: string, heading: string | null): BrainChunk[] {
  const chunks: BrainChunk[] = [];
  const paragraphs = content.split(/\n\n+/);
  let currentChunk = "";

  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim();
    if (!trimmed) continue;

    if (currentChunk.length + trimmed.length + 2 > CHUNK_MAX_CHARS) {
      if (currentChunk.length > 0) {
        chunks.push({
          text: currentChunk.trim(),
          index: 0, // Will be re-indexed by caller
          sectionHeading: heading,
          charCount: currentChunk.trim().length,
        });
        currentChunk = "";
      }

      // If single paragraph exceeds max, split by sentences
      if (trimmed.length > CHUNK_MAX_CHARS) {
        const sentences = trimmed.split(/(?<=[.!?])\s+/);
        let sentenceChunk = "";

        for (const sentence of sentences) {
          if (sentenceChunk.length + sentence.length + 1 > CHUNK_MAX_CHARS) {
            if (sentenceChunk.length > 0) {
              chunks.push({
                text: sentenceChunk.trim(),
                index: 0,
                sectionHeading: heading,
                charCount: sentenceChunk.trim().length,
              });
              sentenceChunk = "";
            }

            // If single sentence exceeds max, force split by words
            if (sentence.length > CHUNK_MAX_CHARS) {
              const words = sentence.split(/\s+/);
              let wordChunk = "";
              for (const word of words) {
                if (wordChunk.length + word.length + 1 > CHUNK_MAX_CHARS) {
                  if (wordChunk.length > 0) {
                    chunks.push({
                      text: wordChunk.trim(),
                      index: 0,
                      sectionHeading: heading,
                      charCount: wordChunk.trim().length,
                    });
                  }
                  wordChunk = word;
                } else {
                  wordChunk += (wordChunk ? " " : "") + word;
                }
              }
              if (wordChunk) sentenceChunk = wordChunk;
            } else {
              sentenceChunk = sentence;
            }
          } else {
            sentenceChunk += (sentenceChunk ? " " : "") + sentence;
          }
        }
        if (sentenceChunk) currentChunk = sentenceChunk;
      } else {
        currentChunk = trimmed;
      }
    } else {
      currentChunk += (currentChunk ? "\n\n" : "") + trimmed;
    }
  }

  if (currentChunk.trim().length > 0) {
    chunks.push({
      text: currentChunk.trim(),
      index: 0,
      sectionHeading: heading,
      charCount: currentChunk.trim().length,
    });
  }

  return chunks;
}

function addOverlap(chunks: BrainChunk[]): BrainChunk[] {
  if (chunks.length <= 1 || CHUNK_OVERLAP_CHARS <= 0) return chunks;

  return chunks.map((chunk, i) => {
    if (i === 0) return chunk;

    const prevChunk = chunks[i - 1];
    // Only add overlap from same section
    if (prevChunk.sectionHeading !== chunk.sectionHeading) return chunk;

    const overlapText = prevChunk.text.slice(-CHUNK_OVERLAP_CHARS);
    const overlappedText = `...${overlapText}\n\n${chunk.text}`;

    return {
      ...chunk,
      text: overlappedText,
      charCount: overlappedText.length,
    };
  });
}

// =====================================================================
// SUMMARY CHUNK GENERATION
// =====================================================================

export async function generateSummaryChunk(
  markdown: string,
  mindName: string
): Promise<string> {
  const client = getAnthropicClient();

  const response = await client.messages.create({
    model: LLM_MODEL,
    max_tokens: 1024,
    system:
      "You generate concise knowledge base summaries. Output a single paragraph of ~400-500 characters summarizing what this knowledge base covers. List the major topics and areas of expertise. Do not use markdown formatting. Be factual and direct.",
    messages: [
      {
        role: "user",
        content: `Summarize the knowledge base for "${mindName}":\n\n${markdown.slice(0, 20000)}`,
      },
    ],
  });

  const text = response.content[0]?.type === "text" ? response.content[0].text : "";
  return text.slice(0, 600); // Hard cap
}

// =====================================================================
// FULL EMBEDDING PIPELINE
// =====================================================================

export async function regenerateEmbeddings(
  mindId: string,
  versionId: string,
  brainMarkdown: string,
  mindName: string
): Promise<{ chunksCreated: number }> {
  const { MindBrainChunkModel } = await import("../../../models/MindBrainChunkModel");

  logger.info(
    `[MINDS-RAG] Regenerating embeddings for mind ${mindId}, version ${versionId}, ${brainMarkdown.length} chars`
  );

  // Chunk the brain
  const chunks = chunkBrainMarkdown(brainMarkdown);
  logger.info(`[MINDS-RAG] Created ${chunks.length} chunks`);

  if (chunks.length === 0) {
    await MindBrainChunkModel.deleteByMind(mindId);
    return { chunksCreated: 0 };
  }

  // Generate embeddings in batch
  const texts = chunks.map((c) => c.text);
  const embeddings = await generateEmbeddings(texts);

  // Generate summary chunk
  const summaryText = await generateSummaryChunk(brainMarkdown, mindName);
  const [summaryEmbedding] = await generateEmbeddings([summaryText]);

  // Clear old chunks and insert new ones
  await MindBrainChunkModel.deleteByMind(mindId);

  const chunkRecords = chunks.map((c, i) => ({
    mind_id: mindId,
    version_id: versionId,
    chunk_index: c.index,
    chunk_text: c.text,
    section_heading: c.sectionHeading,
    embedding: embeddings[i],
    embedding_model: EMBEDDING_MODEL,
    char_count: c.charCount,
    is_summary: false,
  }));

  // Add summary chunk
  chunkRecords.push({
    mind_id: mindId,
    version_id: versionId,
    chunk_index: -1, // Special index for summary
    chunk_text: summaryText,
    section_heading: null,
    embedding: summaryEmbedding,
    embedding_model: EMBEDDING_MODEL,
    char_count: summaryText.length,
    is_summary: true,
  });

  await MindBrainChunkModel.bulkInsert(chunkRecords);

  logger.info(
    `[MINDS-RAG] Stored ${chunkRecords.length} chunks (${chunks.length} content + 1 summary)`
  );

  return { chunksCreated: chunkRecords.length };
}
