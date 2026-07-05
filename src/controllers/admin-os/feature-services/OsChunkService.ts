/**
 * Heading-aware Markdown chunking for the OS ingest pipeline
 * (plans/07042026-alloro-os-admin-port, P4 T2; port of
 * alloro-os/backend/src/services/rag/chunk.ts). Each chunk carries its full
 * heading path ("H1 > H2 > H3") so retrieval citations point at the exact
 * section; long sections are windowed with overlap; code fences never split a
 * heading match. Pure text transformation — no DB, no providers.
 */

export interface OsChunk {
  chunkIndex: number;
  headingPath: string | null;
  content: string;
  tokenCount: number;
}

/** Windowing knobs (§4.2) — identical to the OS source. */
const OS_CHUNK_MAX_TOKENS = 800;
const OS_CHUNK_OVERLAP_TOKENS = 100;
/** Rough chars-per-token estimate — good enough for windowing. */
const OS_CHARS_PER_TOKEN = 4;
/** Prefer a newline boundary only past this fraction of the window. */
const OS_WINDOW_BOUNDARY_MIN_FRACTION = 0.5;

const estimateTokens = (text: string): number =>
  Math.ceil(text.length / OS_CHARS_PER_TOKEN);

interface OsMarkdownSection {
  headingPath: string | null;
  body: string;
}

function splitSections(markdown: string): OsMarkdownSection[] {
  const sections: OsMarkdownSection[] = [];
  const stack: { level: number; text: string }[] = [];
  let buffer: string[] = [];
  let inFence = false;

  const flush = () => {
    const body = buffer.join("\n").trim();
    if (body) {
      sections.push({
        headingPath: stack.length ? stack.map((s) => s.text).join(" > ") : null,
        body,
      });
    }
    buffer = [];
  };

  for (const line of markdown.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    const heading = inFence ? null : /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading) {
      flush();
      const level = heading[1].length;
      while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
      stack.push({ level, text: heading[2].trim() });
    }
    buffer.push(line);
  }
  flush();
  return sections;
}

/** Window an over-long section into overlapping pieces on line boundaries. */
function windowText(text: string): string[] {
  if (estimateTokens(text) <= OS_CHUNK_MAX_TOKENS) return [text];
  const maxChars = OS_CHUNK_MAX_TOKENS * OS_CHARS_PER_TOKEN;
  const overlapChars = OS_CHUNK_OVERLAP_TOKENS * OS_CHARS_PER_TOKEN;
  const pieces: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + maxChars, text.length);
    if (end < text.length) {
      const newline = text.lastIndexOf("\n", end);
      if (newline > start + maxChars * OS_WINDOW_BOUNDARY_MIN_FRACTION) {
        end = newline; // prefer a line boundary over a mid-line cut
      }
    }
    const piece = text.slice(start, end).trim();
    if (piece) pieces.push(piece);
    if (end >= text.length) break;
    start = Math.max(end - overlapChars, start + 1);
  }
  return pieces;
}

export class OsChunkService {
  static chunkMarkdown(markdown: string): OsChunk[] {
    const chunks: OsChunk[] = [];
    let index = 0;
    for (const section of splitSections(markdown)) {
      for (const piece of windowText(section.body)) {
        chunks.push({
          chunkIndex: index++,
          headingPath: section.headingPath,
          content: piece,
          tokenCount: estimateTokens(piece),
        });
      }
    }
    return chunks;
  }
}
