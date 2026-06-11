import { AlertTriangle, Loader2, Upload } from "lucide-react";
import type { PublishLintWarning } from "../../utils/publishLint";

export type PublishConfirmModalProps = {
  isOpen: boolean;
  warnings: PublishLintWarning[];
  isLoading: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

/**
 * Publish confirmation with advisory pre-publish lint chips. Warnings never
 * block publishing — they exist so obvious issues (missing alt text, dead
 * internal links) get a glance before going live.
 */
export default function PublishConfirmModal({
  isOpen,
  warnings,
  isLoading,
  onClose,
  onConfirm,
}: PublishConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={isLoading ? undefined : onClose}
      />
      <div className="relative bg-white rounded-xl shadow-xl border border-gray-200 w-full max-w-md mx-4 p-6">
        <h3 className="text-base font-bold text-gray-900 mb-2">Publish Page</h3>
        <p className="text-sm text-gray-600 mb-4">
          Publish this page? The current published version will be replaced.
          You'll continue editing in a new draft.
        </p>

        {warnings.length > 0 && (
          <div className="mb-4 space-y-1.5">
            <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider">
              Heads up — publish is still allowed
            </p>
            <div className="max-h-40 overflow-y-auto space-y-1.5">
              {warnings.map((warning, index) => (
                <div
                  key={`${warning.type}-${index}`}
                  className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2"
                >
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
                  <span className="text-xs text-amber-800">{warning.message}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className="px-4 py-2 rounded-lg text-sm bg-alloro-orange text-white hover:bg-alloro-orange/90 transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            {isLoading ? "Publishing..." : "Publish"}
          </button>
        </div>
      </div>
    </div>
  );
}
