import { useCallback, useRef, useState } from "react";

import {
  getPasteInfo,
  runPastePipeline,
  type PasteParserType,
  type PastePhase,
  type PastePipelineProgress,
} from "./pastePipeline";
import type { MonthBucket, PasteInfo } from "./types";

export type { PastePhase } from "./pastePipeline";

type ParsedPasteMetadata = {
  parserType: PasteParserType;
  rawText: string;
  rowsParsed: number;
};

type UsePasteHandlerOptions = {
  currentMonth: string;
  targetMonth?: string | null;
  onParsed: (months: MonthBucket[], metadata: ParsedPasteMetadata) => void;
  onError: (message: string) => void;
  onWarnings?: (warnings: string[]) => void;
};

export function usePasteHandler({
  currentMonth,
  targetMonth,
  onParsed,
  onError,
  onWarnings,
}: UsePasteHandlerOptions) {
  const [isPasting, setIsPasting] = useState(false);
  const [phase, setPhase] = useState<PastePhase>("idle");
  const [showConfirm, setShowConfirm] = useState(false);
  const [pasteInfo, setPasteInfo] = useState<PasteInfo | null>(null);
  const [rowsParsed, setRowsParsed] = useState<number | null>(null);
  const [requiresSanitization, setRequiresSanitization] = useState(false);
  const rawTextRef = useRef("");

  const handleProgress = useCallback((progress: PastePipelineProgress) => {
    setPhase(progress.phase);
    setRowsParsed(progress.rowsParsed);
    setRequiresSanitization(progress.requiresSanitization);
  }, []);

  const handlePasteEvent = useCallback((event: React.ClipboardEvent) => {
    const target = event.target as HTMLElement;
    if (
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.isContentEditable
    ) {
      return;
    }

    const text = event.clipboardData.getData("text/plain");
    const info = text ? getPasteInfo(text) : null;
    if (!info) return;
    event.preventDefault();
    rawTextRef.current = text;
    setPasteInfo(info);
    setShowConfirm(true);
  }, []);

  const reset = useCallback(() => {
    setIsPasting(false);
    setPhase("idle");
    setShowConfirm(false);
    setPasteInfo(null);
    setRowsParsed(null);
    setRequiresSanitization(false);
    rawTextRef.current = "";
  }, []);

  const cancelPaste = useCallback(() => {
    if (!isPasting) reset();
  }, [isPasting, reset]);

  const confirmPaste = useCallback(async () => {
    const rawText = rawTextRef.current;
    if (!rawText) return;
    setIsPasting(true);
    let completed = false;
    try {
      const result = await runPastePipeline({
        rawText,
        currentMonth,
        targetMonth,
        onProgress: handleProgress,
      });
      onParsed(result.months, {
        parserType: result.parserType,
        rawText,
        rowsParsed: result.rowsParsed,
      });
      if (result.warnings.length > 0) onWarnings?.(result.warnings);
      completed = true;
    } catch (error) {
      onError(error instanceof Error ? error.message : "Failed to parse data");
    } finally {
      if (completed) {
        setIsPasting(false);
      } else {
        reset();
      }
    }
  }, [
    currentMonth,
    handleProgress,
    onError,
    onParsed,
    onWarnings,
    reset,
    targetMonth,
  ]);

  return {
    isPasting,
    phase,
    showConfirm,
    pasteInfo,
    rowsParsed,
    requiresSanitization,
    confirmPaste,
    cancelPaste,
    handlePasteEvent,
  };
}
