import { useCallback, useEffect } from "react";
import type { Section } from "../api/templates";

const STORAGE_PREFIX = "alloro-editor-recovery:";
const BACKUP_DEBOUNCE_MS = 1000;

export type DraftBackup = {
  sections: Section[];
  savedAt: number;
};

export type UseLocalDraftBackupArgs = {
  pageId: string | null;
  sections: Section[];
  isDirty: boolean;
};

/**
 * Crash-recovery mirror for the website editor's manual-save model: dirty
 * sections are debounce-mirrored to localStorage and cleared on successful
 * save/publish/restore. The editor offers recovery on load when a backup is
 * newer than the server row. Storage failures (quota, private mode) are
 * silently ignored — this is best-effort protection, not persistence.
 */
export function useLocalDraftBackup({
  pageId,
  sections,
  isDirty,
}: UseLocalDraftBackupArgs) {
  useEffect(() => {
    if (!pageId || !isDirty) return;
    const timeout = setTimeout(() => {
      try {
        const backup: DraftBackup = { sections, savedAt: Date.now() };
        localStorage.setItem(STORAGE_PREFIX + pageId, JSON.stringify(backup));
      } catch {
        // Quota exceeded / unavailable storage — recovery simply unavailable.
      }
    }, BACKUP_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [pageId, sections, isDirty]);

  const clearBackup = useCallback(
    (targetPageId?: string | null) => {
      const key = targetPageId ?? pageId;
      if (!key) return;
      try {
        localStorage.removeItem(STORAGE_PREFIX + key);
      } catch {
        // Ignore — nothing to clean up if storage is unavailable.
      }
    },
    [pageId],
  );

  const readBackup = useCallback((targetPageId: string): DraftBackup | null => {
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + targetPageId);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as DraftBackup;
      if (!Array.isArray(parsed.sections) || !parsed.savedAt) return null;
      return parsed;
    } catch {
      return null;
    }
  }, []);

  return { clearBackup, readBackup };
}
