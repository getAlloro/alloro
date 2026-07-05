import { Lock, PenLine, RotateCw } from "lucide-react";
import type { OsLockState } from "../../../../hooks/queries/useAdminOsLock";
import type { OsDraftSaveStatus } from "../../../../hooks/useOsDraftAutosave";
import { formatOsClockTime } from "../shared/osFormat";

/**
 * Lock + autosave status line for the editor (P3 T4). Holding the lock shows
 * the quiet mono "Saved · HH:MM" stamp; blocked shows the amber "X is
 * editing" banner with the editor in read-only.
 */

function saveStamp(status: OsDraftSaveStatus, lastSavedAt: Date | null): string {
  if (status === "saving") return "Saving…";
  if (status === "error") return "Autosave failed — edits retry on next change";
  if (status === "saved" && lastSavedAt) {
    return `Saved · ${formatOsClockTime(lastSavedAt)}`;
  }
  return "Draft loaded";
}

export function OsLockBanner({
  lockState,
  holderName,
  saveStatus,
  lastSavedAt,
  onRetry,
}: {
  lockState: OsLockState;
  holderName: string | null;
  saveStatus: OsDraftSaveStatus;
  lastSavedAt: Date | null;
  onRetry: () => void;
}) {
  if (lockState === "blocked") {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-amber-soft px-3.5 py-2.5">
        <p className="flex items-center gap-2 text-[13px] font-medium text-gray-800">
          <Lock className="h-3.5 w-3.5 text-amber" strokeWidth={1.75} />
          {holderName ?? "Someone else"} is editing this document — read-only.
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 rounded-[9px] border border-line-medium bg-alloro-surface px-2.5 py-1 text-[12px] font-semibold text-gray-700 transition-colors duration-150 hover:bg-gray-50"
        >
          <RotateCw className="h-3 w-3" strokeWidth={1.75} />
          Try again
        </button>
      </div>
    );
  }

  if (lockState === "error") {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-danger-soft px-3.5 py-2.5">
        <p className="text-[13px] font-medium text-alloro-danger">
          Couldn't acquire the edit lock.
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 rounded-[9px] border border-alloro-danger/30 bg-alloro-surface px-2.5 py-1 text-[12px] font-semibold text-alloro-danger transition-colors duration-150 hover:bg-danger-soft"
        >
          <RotateCw className="h-3 w-3" strokeWidth={1.75} />
          Retry
        </button>
      </div>
    );
  }

  if (lockState === "acquiring") {
    return (
      <p className="font-mono text-[11px] text-gray-400">Acquiring edit lock…</p>
    );
  }

  return (
    <p
      className={`flex items-center gap-1.5 font-mono text-[11px] tabular-nums ${
        saveStatus === "error" ? "text-alloro-danger" : "text-gray-400"
      }`}
    >
      <PenLine className="h-3 w-3" strokeWidth={1.75} />
      Editing · {saveStamp(saveStatus, lastSavedAt)}
    </p>
  );
}
