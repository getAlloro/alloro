import { ClipboardPaste, FileText } from "lucide-react";

import type { PasteInfo } from "./types";

export type PasteConfirmationProps = {
  pasteInfo: PasteInfo;
  isFile: boolean;
  droppedFileName?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
};

export function PasteConfirmation({
  pasteInfo,
  isFile,
  droppedFileName,
  onCancel,
  onConfirm,
}: PasteConfirmationProps) {
  const infoRows = [
    { label: "Size", value: `${pasteInfo.sizeKB.toFixed(1)} KB` },
    { label: "Rows detected", value: String(pasteInfo.estimatedRows) },
  ];

  return (
    <>
      <p className="mb-4 text-center text-sm text-alloro-navy/60">
        {isFile
          ? `Ready to parse ${droppedFileName}.`
          : "Ready to parse the complete pasted dataset."}
      </p>
      <div className="mb-5 w-full space-y-2 rounded-xl border border-alloro-navy/5 bg-alloro-navy/[0.03] p-3">
        {infoRows.map(({ label, value }) => (
          <div key={label} className="flex justify-between text-xs">
            <span className="text-alloro-navy/50">{label}</span>
            <span className="font-medium tabular-nums text-alloro-navy/75">
              {value}
            </span>
          </div>
        ))}
      </div>
      <div className="flex w-full gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-lg border border-alloro-navy/15 px-4 py-2 text-sm font-medium text-alloro-navy/70 transition-all duration-200 hover:bg-alloro-navy/5 focus-visible:ring-2 focus-visible:ring-alloro-teal/50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-alloro-orange px-4 py-2 text-sm font-medium text-slate-50 transition-all duration-200 hover:scale-[1.02] hover:brightness-105 focus-visible:ring-2 focus-visible:ring-alloro-teal/50"
        >
          {isFile ? (
            <FileText className="h-4 w-4" />
          ) : (
            <ClipboardPaste className="h-4 w-4" />
          )}
          {isFile ? "Parse File" : "Parse Data"}
        </button>
      </div>
    </>
  );
}
