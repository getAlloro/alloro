import { Loader2 } from "lucide-react";

import {
  formatMonthList,
  type PmsUploadPreviewData,
} from "../pmsManualEntryModal.utils";

interface SelectedFilePanelProps {
  selectedUploadFile: File | null;
  isPreviewingUpload: boolean;
  uploadPreview: PmsUploadPreviewData | null;
}

export const SelectedFilePanel: React.FC<SelectedFilePanelProps> = ({
  selectedUploadFile,
  isPreviewingUpload,
  uploadPreview,
}) => {
  return (
    <>
      {selectedUploadFile && (
        <div className="rounded-xl border border-alloro-orange/30 bg-alloro-orange/10 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-alloro-orange">
                {isPreviewingUpload ? "Previewing file" : "File ready"}
              </p>
              <p className="mt-1 text-sm font-bold text-gray-900">
                {selectedUploadFile.name}
              </p>
            </div>
            {isPreviewingUpload && (
              <span className="inline-flex items-center gap-2 text-xs font-bold text-gray-600">
                <Loader2 className="h-4 w-4 animate-spin" />
                Checking months
              </span>
            )}
          </div>
          {uploadPreview && (
            <div className="mt-3 rounded-lg bg-white/80 p-3 text-xs font-semibold text-gray-700">
              <p>
                Parsed months:{" "}
                {formatMonthList(uploadPreview.incomingMonths)}
              </p>
              <p className="mt-1">
                {uploadPreview.supersededMonths.length > 0
                  ? `Will overwrite: ${formatMonthList(
                      uploadPreview.supersededMonths.map(
                        (month) => month.month
                      )
                    )}`
                  : "No existing months will be overwritten."}
              </p>
            </div>
          )}
        </div>
      )}
    </>
  );
};
