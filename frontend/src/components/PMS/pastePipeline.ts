import {
  parsePastedData,
  sanitizePastedData,
  type SanitizationRow,
} from "../../api/pms";
import { transformBackendToUI } from "./pmsDataTransform";
import type { MonthBucket, PasteInfo } from "./types";

export type PastePhase = "idle" | "parsing" | "sanitizing" | "ready";
export type PasteParserType = "default" | "dentalemr";

export type PastePipelineProgress = {
  phase: Exclude<PastePhase, "idle">;
  rowsParsed: number | null;
  requiresSanitization: boolean;
};

export type PastePipelineResult = {
  months: MonthBucket[];
  parserType: PasteParserType;
  warnings: string[];
  rowsParsed: number;
};

type RunPastePipelineOptions = {
  rawText: string;
  currentMonth: string;
  targetMonth?: string | null;
  onProgress: (progress: PastePipelineProgress) => void;
};

export function getPasteInfo(text: string): PasteInfo | null {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) return null;
  const hasTabs = lines.some((line) => line.includes("\t"));
  const hasCommas = !hasTabs && lines.some((line) => line.includes(","));
  if (!hasTabs && !hasCommas) return null;

  return {
    sizeKB: new Blob([text]).size / 1024,
    estimatedRows: Math.max(0, lines.length - 1),
  };
}

function rowsToBuckets(rows: SanitizationRow[]): MonthBucket[] {
  const buckets = new Map<string, MonthBucket>();
  for (const row of rows) {
    const bucket = buckets.get(row.month) ?? {
      id: Date.now() + buckets.size,
      month: row.month,
      rows: [],
    };
    bucket.rows.push({
      id: Date.now() + bucket.rows.length,
      source: row.source,
      type: row.type,
      referrals: String(row.referrals),
      production: String(row.production),
    });
    buckets.set(row.month, bucket);
  }
  return Array.from(buckets.values());
}

function getSanitizationWarnings(
  exactGroupsMerged: number,
  fuzzyGroupsConfirmed: number,
): string[] {
  if (exactGroupsMerged === 0 && fuzzyGroupsConfirmed === 0) return [];
  return [
    `Deduplicated: ${exactGroupsMerged} exact + ${fuzzyGroupsConfirmed} fuzzy group(s) merged.`,
  ];
}

async function sanitizeRows(
  rows: SanitizationRow[],
  warnings: string[],
): Promise<{ rows: SanitizationRow[]; warnings: string[] }> {
  const result = await sanitizePastedData(rows);
  if (!result.success || !result.data) {
    return {
      rows,
      warnings: [
        ...warnings,
        "Data cleaning could not complete — using unprocessed results.",
      ],
    };
  }

  return {
    rows: result.data.allRows,
    warnings: [
      ...warnings,
      ...(result.data.warnings ?? []),
      ...getSanitizationWarnings(
        result.data.stats.exactGroupsMerged,
        result.data.stats.fuzzyGroupsConfirmed,
      ),
    ],
  };
}

export async function runPastePipeline({
  rawText,
  currentMonth,
  targetMonth,
  onProgress,
}: RunPastePipelineOptions): Promise<PastePipelineResult> {
  onProgress({
    phase: "parsing",
    rowsParsed: null,
    requiresSanitization: false,
  });
  const result = await parsePastedData(rawText, currentMonth, targetMonth);
  if (!result.success || !result.data) {
    throw new Error(
      typeof result.error === "string"
        ? result.error
        : result.error?.message || "Parsing failed",
    );
  }

  const { data } = result;
  let warnings = [...(data.warnings ?? [])];
  let months: MonthBucket[];

  if (data.requiresSanitization) {
    onProgress({
      phase: "sanitizing",
      rowsParsed: data.rowsParsed,
      requiresSanitization: true,
    });
    const sanitized = await sanitizeRows(data.rows, warnings);
    warnings = sanitized.warnings;
    months = rowsToBuckets(sanitized.rows);
  } else if (data.monthlyRollup?.length) {
    months = transformBackendToUI(data.monthlyRollup);
  } else {
    months = rowsToBuckets(data.rows);
  }

  if (months.every((month) => month.rows.length === 0)) {
    throw new Error("No data could be parsed from the pasted content.");
  }

  onProgress({
    phase: "ready",
    rowsParsed: data.rowsParsed,
    requiresSanitization: data.requiresSanitization,
  });
  return {
    months,
    parserType: data.parserType,
    warnings: [...new Set(warnings)],
    rowsParsed: data.rowsParsed,
  };
}
