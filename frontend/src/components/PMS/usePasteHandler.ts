import { useCallback, useRef, useState } from "react";
import {
  parsePastedData,
  sanitizePastedData,
} from "../../api/pms";
import type { SanitizationRow } from "../../api/pms";
import type { MonthBucket, PasteInfo, SourceRow } from "./types";
import { logger } from "../../lib/logger";

const ROWS_PER_BATCH = 50;

export type PastePhase = "idle" | "parsing" | "sanitizing";

interface UsePasteHandlerOptions {
  currentMonth: string; // YYYY-MM fallback
  onParsed: (months: MonthBucket[]) => void;
  onError: (msg: string) => void;
  onWarnings?: (warnings: string[]) => void;
}

interface UsePasteHandlerReturn {
  isPasting: boolean;
  phase: PastePhase;
  showConfirm: boolean;
  pasteInfo: PasteInfo | null;
  batchProgress: { current: number; total: number } | null;
  confirmPaste: () => void;
  cancelPaste: () => void;
  handlePasteEvent: (e: React.ClipboardEvent) => void;
}

/**
 * Detect if pasted content looks like tabular data (from a spreadsheet or CSV).
 */
function isTabularPaste(text: string): boolean {
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length < 2) return false;

  const hasTabDelimiters = lines.some((l) => l.includes("\t"));
  const hasCommaDelimiters =
    !hasTabDelimiters && lines.some((l) => l.includes(","));

  return hasTabDelimiters || hasCommaDelimiters;
}

/**
 * Split raw text into chunks of ROWS_PER_BATCH data rows,
 * preserving the header line in every chunk.
 */
function chunkByRows(raw: string): string[] {
  const lines = raw.split("\n");
  const headerLine = lines[0] || "";
  const dataLines = lines.slice(1).filter((l) => l.trim().length > 0);

  if (dataLines.length <= ROWS_PER_BATCH) return [raw];

  const chunks: string[] = [];
  for (let i = 0; i < dataLines.length; i += ROWS_PER_BATCH) {
    const batch = dataLines.slice(i, i + ROWS_PER_BATCH);
    chunks.push(headerLine + "\n" + batch.join("\n"));
  }

  return chunks;
}

/**
 * Convert SanitizationRow[] to MonthBucket[] for the UI.
 */
function rowsToBuckets(rows: SanitizationRow[]): MonthBucket[] {
  const map = new Map<string, MonthBucket>();

  for (const row of rows) {
    let bucket = map.get(row.month);
    if (!bucket) {
      bucket = {
        id: Date.now() + Math.random() * 10000,
        month: row.month,
        rows: [],
      };
      map.set(row.month, bucket);
    }
    bucket.rows.push({
      id: Date.now() + Math.random() * 10000,
      source: row.source,
      type: row.type,
      referrals: String(row.referrals),
      production: String(row.production),
    } as SourceRow);
  }

  return Array.from(map.values());
}

export function usePasteHandler({
  currentMonth,
  onParsed,
  onError,
  onWarnings,
}: UsePasteHandlerOptions): UsePasteHandlerReturn {
  const [isPasting, setIsPasting] = useState(false);
  const [phase, setPhase] = useState<PastePhase>("idle");
  const [showConfirm, setShowConfirm] = useState(false);
  const [pasteInfo, setPasteInfo] = useState<PasteInfo | null>(null);
  const [batchProgress, setBatchProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);

  const rawTextRef = useRef<string>("");

  const handlePasteEvent = useCallback(
    (e: React.ClipboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      const text = e.clipboardData.getData("text/plain");
      if (!text || !isTabularPaste(text)) return;

      e.preventDefault();

      const sizeKB = new Blob([text]).size / 1024;
      const lines = text.split("\n").filter((l) => l.trim().length > 0);
      const estimatedRows = Math.max(0, lines.length - 1);
      const chunksRequired = Math.ceil(estimatedRows / ROWS_PER_BATCH);

      rawTextRef.current = text;
      setPasteInfo({ text, sizeKB, estimatedRows, chunksRequired });
      setShowConfirm(true);
    },
    []
  );

  const cancelPaste = useCallback(() => {
    setShowConfirm(false);
    setPasteInfo(null);
    rawTextRef.current = "";
  }, []);

  const confirmPaste = useCallback(async () => {
    const raw = rawTextRef.current;
    if (!raw) return;

    setIsPasting(true);
    const allWarnings: string[] = [];
    const allRows: SanitizationRow[] = [];

    try {
      // ===============================================
      // PHASE 1: JS PARSING — batch by 50 rows
      // ===============================================
      setPhase("parsing");
      const chunks = chunkByRows(raw);

      logger.log(`[PMS-Paste] Parsing ${chunks.length} batch(es)...`);

      for (let i = 0; i < chunks.length; i++) {
        setBatchProgress({ current: i + 1, total: chunks.length });
        logger.log(`[PMS-Paste] Parsing batch ${i + 1}/${chunks.length}...`);

        const result = await parsePastedData(chunks[i], currentMonth);

        if (!result.success || !result.data) {
          throw new Error(result.error || "Parsing failed");
        }

        allRows.push(...result.data.rows);

        if (result.data.warnings?.length) {
          allWarnings.push(...result.data.warnings);
        }
      }

      if (allRows.length === 0) {
        throw new Error("No data could be parsed from the pasted content.");
      }

      logger.log(`[PMS-Paste] Parsed ${allRows.length} total rows`);

      // ===============================================
      // PHASE 2: SANITIZATION — smart dedup
      // ===============================================
      setPhase("sanitizing");
      setBatchProgress(null);
      logger.log("[PMS-Paste] Sanitizing/deduplicating...");

      const sanitizeResult = await sanitizePastedData(allRows);

      if (sanitizeResult.success && sanitizeResult.data) {
        const { allRows: sanitizedRows, stats, reasoning, warnings } =
          sanitizeResult.data;

        logger.log("[PMS-Paste] Sanitization stats:", JSON.stringify(stats));

        if (reasoning?.length) {
          logger.log("[PMS-Paste] Dedup reasoning:", reasoning);
        }

        if (warnings?.length) {
          allWarnings.push(...warnings);
        }

        if (stats.exactGroupsMerged > 0 || stats.fuzzyGroupsConfirmed > 0) {
          allWarnings.push(
            `Deduplicated: ${stats.exactGroupsMerged} exact + ${stats.fuzzyGroupsConfirmed} fuzzy group(s) merged.`
          );
        }

        const buckets = rowsToBuckets(sanitizedRows);
        onParsed(buckets);
      } else {
        logger.warn("[PMS-Paste] Sanitization failed, using raw parsed data:", sanitizeResult.error);
        allWarnings.push("Data cleaning could not complete — using unprocessed results.");
        const buckets = rowsToBuckets(allRows);
        onParsed(buckets);
      }

      if (allWarnings.length > 0) {
        onWarnings?.(allWarnings);
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to parse data");
    } finally {
      setIsPasting(false);
      setPhase("idle");
      setShowConfirm(false);
      setPasteInfo(null);
      setBatchProgress(null);
      rawTextRef.current = "";
    }
  }, [currentMonth, onParsed, onError, onWarnings]);

  return {
    isPasting,
    phase,
    showConfirm,
    pasteInfo,
    batchProgress,
    confirmPaste,
    cancelPaste,
    handlePasteEvent,
  };
}
