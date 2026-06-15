import { useCallback } from "react";
import { logger } from "../../../../lib/logger";

interface ClipboardEnvelope<T> {
  __alloro_clipboard: string;
  payload: T;
}

function isEnvelope<T>(v: unknown, kind: string): v is ClipboardEnvelope<T> {
  if (typeof v !== "object" || v === null) return false;
  const obj = v as Record<string, unknown>;
  return obj.__alloro_clipboard === kind && "payload" in obj;
}

export function useClipboardRow<T>(kind: string) {
  const copy = useCallback(
    async (item: T): Promise<boolean> => {
      try {
        const envelope: ClipboardEnvelope<T> = {
          __alloro_clipboard: kind,
          payload: item,
        };
        await navigator.clipboard.writeText(JSON.stringify(envelope));
        return true;
      } catch (err) {
        logger.warn("[useClipboardRow] copy failed:", err);
        return false;
      }
    },
    [kind]
  );

  const paste = useCallback(async (): Promise<T | null> => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) return null;
      const parsed: unknown = JSON.parse(text);
      if (!isEnvelope<T>(parsed, kind)) return null;
      return parsed.payload;
    } catch {
      return null;
    }
  }, [kind]);

  return { copy, paste };
}
