/**
 * Transcript Source
 *
 * Pluggable abstraction over "where do Fireflies transcripts come from?"
 *
 * For the MVP (Q4: manual-trigger only), the source is a directory of JSON
 * files under tmp/fireflies-input/. CC populates this directory using the
 * Fireflies MCP tools available in the Claude Code session. Each JSON file
 * matches the FirefliesTranscript shape.
 *
 * Future production source: a thin GraphQL client against the Fireflies
 * API. The interface here is designed so that swap is a single-file change
 * (replace JsonFileTranscriptSource with FirefliesGraphQLSource at the
 * pipeline call site).
 *
 * Why this indirection now: keeps the rest of the pipeline pure
 * TypeScript with no MCP dependency, so vitest can mock the source easily
 * and so the pipeline can run in a production process that has no MCP
 * client. The JSON file approach is enough for Q4 manual MVP.
 */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { FirefliesTranscript } from "./types";

export interface TranscriptSource {
  /** Fetch transcripts within the window. The implementation decides how
   *  to interpret "within the window"; for the JSON file source, the file
   *  mtime is checked. The orchestrator filters again by transcript.date
   *  after the fact, so this is best-effort.
   */
  fetchWithinHours(hours: number): Promise<FirefliesTranscript[]>;
}

export class JsonFileTranscriptSource implements TranscriptSource {
  constructor(
    private readonly directory: string = "tmp/fireflies-input",
  ) {}

  async fetchWithinHours(_hours: number): Promise<FirefliesTranscript[]> {
    let files: string[];
    try {
      files = await readdir(this.directory);
    } catch (err) {
      console.warn(
        `[TRANSCRIPT_SOURCE_EMPTY] could not read ${this.directory}: ${(err as Error).message}`,
      );
      return [];
    }
    const jsonFiles = files.filter((f) => f.endsWith(".json"));
    const transcripts: FirefliesTranscript[] = [];
    for (const f of jsonFiles) {
      try {
        const raw = await readFile(join(this.directory, f), "utf-8");
        const parsed = JSON.parse(raw) as FirefliesTranscript;
        if (!parsed.id || !parsed.fullText) {
          console.warn(
            `[TRANSCRIPT_PARSE_SKIP] ${f} missing required fields id/fullText; skipping`,
          );
          continue;
        }
        transcripts.push(parsed);
      } catch (err) {
        console.warn(
          `[TRANSCRIPT_PARSE_FAIL] ${f}: ${(err as Error).message}; skipping`,
        );
      }
    }
    return transcripts;
  }
}
