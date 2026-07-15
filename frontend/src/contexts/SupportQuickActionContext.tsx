/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import type { SupportTicketType } from "../api/support";

export type SupportScreenshotClipboardStatus =
  | "copied"
  | "failed"
  | "unavailable";

export type PendingSupportDraft = {
  id: string;
  type: SupportTicketType;
  sourceUrl: string;
  screenshotFile?: File;
  consoleLogFile?: File;
  clipboardStatus: SupportScreenshotClipboardStatus;
  createdAt: number;
};

export type SupportQuickActionContextValue = {
  pendingDraft: PendingSupportDraft | null;
  setPendingDraft: (draft: PendingSupportDraft) => void;
  clearPendingDraft: () => void;
};

const SupportQuickActionContext =
  createContext<SupportQuickActionContextValue | null>(null);

let pendingSupportDraftCache: PendingSupportDraft | null = null;

export function getPendingSupportDraftCache() {
  return pendingSupportDraftCache;
}

export function SupportQuickActionProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [pendingDraft, setPendingDraft] = useState<PendingSupportDraft | null>(
    pendingSupportDraftCache,
  );

  const handleSetPendingDraft = useCallback((draft: PendingSupportDraft) => {
    pendingSupportDraftCache = draft;
    setPendingDraft(draft);
  }, []);

  const handleClearPendingDraft = useCallback(() => {
    pendingSupportDraftCache = null;
    setPendingDraft(null);
  }, []);

  const value = useMemo(
    () => ({
      pendingDraft,
      setPendingDraft: handleSetPendingDraft,
      clearPendingDraft: handleClearPendingDraft,
    }),
    [handleClearPendingDraft, handleSetPendingDraft, pendingDraft],
  );

  return (
    <SupportQuickActionContext.Provider value={value}>
      {children}
    </SupportQuickActionContext.Provider>
  );
}

export function useSupportQuickAction() {
  const context = useContext(SupportQuickActionContext);
  if (!context) {
    throw new Error(
      "useSupportQuickAction must be used inside SupportQuickActionProvider.",
    );
  }
  return context;
}
