import { Trash2, Upload } from "lucide-react";

import {
  ALORO_ORANGE,
  formatMonthLabel,
  formatMonthList,
} from "../pmsManualEntryModal.utils";

interface MonthMismatchBannerProps {
  targetMonth?: string | null;
  monthMismatch: string[] | null;
  droppedFileName: string | null;
  reuploadCorrectedFile: () => void;
  discardMismatchedUpload: () => void;
}

export const MonthMismatchBanner: React.FC<MonthMismatchBannerProps> = ({
  targetMonth,
  monthMismatch,
  droppedFileName,
  reuploadCorrectedFile,
  discardMismatchedUpload,
}) => {
  return (
    <>
      {targetMonth && monthMismatch && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-red-600">
            Month mismatch — upload flagged
          </p>
          <p className="mt-1 text-sm font-bold text-gray-900">
            {droppedFileName
              ? `"${droppedFileName}" contains`
              : "The provided data contains"}{" "}
            data for {formatMonthList(monthMismatch)}. Only{" "}
            {formatMonthLabel(targetMonth)} can be uploaded from this
            view, so nothing was kept.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={reuploadCorrectedFile}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold text-white transition hover:brightness-110"
              style={{ backgroundColor: ALORO_ORANGE }}
            >
              <Upload size={13} />
              Re-upload corrected file
            </button>
            <button
              type="button"
              onClick={discardMismatchedUpload}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-600 transition hover:bg-gray-50"
            >
              <Trash2 size={13} />
              Discard upload
            </button>
          </div>
        </div>
      )}
    </>
  );
};
