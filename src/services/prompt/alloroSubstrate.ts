/**
 * alloroSubstrate — shared loader for the .claude/lattices/* substrate.
 *
 * Surface 3 of the Wave 2 lattice load (May 18, 2026). Every Alloro
 * service that calls the Anthropic API should prepend `getAlloroSubstrate()`
 * to its system prompt so the lattice substrate (Product Outline, Journey,
 * Sentiment, Knowledge) reaches the model. Sub-agents launched via the
 * Agent tool already get the substrate inline via scripts/inject-lattice.ts.
 *
 * Files are read once at module load (cold start) and cached. No per-request
 * filesystem access. If the env var ALLORO_DISABLE_SUBSTRATE=1 is set, returns
 * empty string — used for tests and isolation runs.
 *
 * Public API (stable):
 *   getAlloroSubstrate(): string                — full substrate, cached
 *   getProductOutline(): string                 — just product-outline.md
 *   getJourneyLattice(): string                 — just journey-lattice.md
 *   getSentimentLattice(): string               — just sentiment-lattice.md
 *   getKnowledgeLattice(): string               — just knowledge-lattice.md
 *   prependSubstrate(prompt: string): string    — convenience for services
 */

import * as fs from "fs";
import * as path from "path";

const LATTICE_DIR = path.resolve(__dirname, "../../../.claude/lattices");

function readLattice(filename: string): string {
  const full = path.join(LATTICE_DIR, filename);
  try {
    return fs.readFileSync(full, "utf-8").trimEnd();
  } catch (err: any) {
    console.warn(`[alloroSubstrate] failed to read ${filename}: ${err.message}`);
    return "";
  }
}

const DISABLED = process.env.ALLORO_DISABLE_SUBSTRATE === "1";

// Cold-start cache. Re-read happens only at process boot.
const PRODUCT_OUTLINE = DISABLED ? "" : readLattice("product-outline.md");
const JOURNEY_LATTICE = DISABLED ? "" : readLattice("journey-lattice.md");
const SENTIMENT_LATTICE = DISABLED ? "" : readLattice("sentiment-lattice.md");
const KNOWLEDGE_LATTICE = DISABLED ? "" : readLattice("knowledge-lattice.md");

const SUBSTRATE = DISABLED
  ? ""
  : [
      "# Alloro Lattice Substrate",
      "",
      "Read before any Alloro output. Product Outline = canonical product truth. Journey Lattice = customer-journey vocabulary. Sentiment Lattice = voice/posture. Knowledge Lattice = operating heuristics.",
      "",
      PRODUCT_OUTLINE,
      "",
      JOURNEY_LATTICE,
      "",
      SENTIMENT_LATTICE,
      "",
      KNOWLEDGE_LATTICE,
    ]
      .filter((s) => s.length > 0)
      .join("\n");

export function getAlloroSubstrate(): string {
  return SUBSTRATE;
}

export function getProductOutline(): string {
  return PRODUCT_OUTLINE;
}

export function getJourneyLattice(): string {
  return JOURNEY_LATTICE;
}

export function getSentimentLattice(): string {
  return SENTIMENT_LATTICE;
}

export function getKnowledgeLattice(): string {
  return KNOWLEDGE_LATTICE;
}

/**
 * Convenience: prepend the substrate to an existing system prompt with a
 * thin separator. Most services call this once at prompt construction.
 */
export function prependSubstrate(systemPrompt: string): string {
  if (!SUBSTRATE) return systemPrompt;
  return `${SUBSTRATE}\n\n---\n\n${systemPrompt}`;
}
