import { useCallback, useEffect, useRef, useState } from "react";
import { adminOsSaveDraft } from "../api/admin-os";

/**
 * Debounced draft autosave for the OS editor (plans/07042026-alloro-os-admin-
 * port P3 T4): 800ms after the last keystroke, PUT the markdown to the draft
 * endpoint and expose the state behind the mono "Saved · HH:MM" stamp.
 * saveNow() flushes the pending write (used before opening the publish modal
 * so the published version can't lose the debounce tail).
 */

const OS_AUTOSAVE_DEBOUNCE_MS = 800;

export type OsDraftSaveStatus = "idle" | "saving" | "saved" | "error";

export type OsDraftAutosaveHandle = {
  status: OsDraftSaveStatus;
  lastSavedAt: Date | null;
  /**
   * Flush the pending debounce immediately; rejects on save failure.
   * baseVersionOverride re-bases the draft (publish-conflict reload) before
   * the state that feeds the hook has re-rendered.
   */
  saveNow: (baseVersionOverride?: number) => Promise<void>;
};

export function useOsDraftAutosave(
  documentId: string | null,
  content: string,
  baseVersion: number | null,
  enabled: boolean,
): OsDraftAutosaveHandle {
  const [status, setStatus] = useState<OsDraftSaveStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  // The first enabled run is the seed echo (editor content set from the
  // loaded draft) — skip it so opening the editor never writes back.
  const isSeedEchoRef = useRef(true);
  const contentRef = useRef(content);
  const baseVersionRef = useRef(baseVersion);
  const timeoutRef = useRef<number | null>(null);
  contentRef.current = content;
  baseVersionRef.current = baseVersion;

  const persistDraft = useCallback(
    async (baseVersionOverride?: number) => {
      if (!documentId) return;
      setStatus("saving");
      try {
        await adminOsSaveDraft(documentId, {
          content_md: contentRef.current,
          base_version: baseVersionOverride ?? baseVersionRef.current,
        });
        setStatus("saved");
        setLastSavedAt(new Date());
      } catch (error) {
        setStatus("error");
        throw error;
      }
    },
    [documentId],
  );

  useEffect(() => {
    if (!enabled || !documentId) return;
    if (isSeedEchoRef.current) {
      isSeedEchoRef.current = false;
      return;
    }
    setStatus("saving");
    const handle = window.setTimeout(() => {
      timeoutRef.current = null;
      persistDraft().catch(() => {
        // Status is already "error"; the stamp surfaces it and the next
        // keystroke retries. Publishing re-validates against the server.
      });
    }, OS_AUTOSAVE_DEBOUNCE_MS);
    timeoutRef.current = handle;
    return () => window.clearTimeout(handle);
  }, [enabled, documentId, content, persistDraft]);

  const saveNow = useCallback(
    async (baseVersionOverride?: number) => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      await persistDraft(baseVersionOverride);
    },
    [persistDraft],
  );

  return { status, lastSavedAt, saveNow };
}
