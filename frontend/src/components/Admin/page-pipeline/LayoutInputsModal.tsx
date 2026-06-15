import { X, Sparkles, Check, Loader2, RefreshCw } from "lucide-react";
import DynamicSlotInputs from "./DynamicSlotInputs";
import type { DynamicSlotDef, LayoutsStatus } from "../../api/websites";

interface LayoutInputsModalProps {
  open: boolean;
  onClose: () => void;
  status: LayoutsStatus | null;
  slots: DynamicSlotDef[];
  values: Record<string, string>;
  onSlotChange: (key: string, value: string) => void;
  loadingSlots: boolean;
  startingLayouts: boolean;
  onGenerate: () => void;
  onCancel: () => void;
}

export default function LayoutInputsModal({
  open,
  onClose,
  status,
  slots,
  values,
  onSlotChange,
  loadingSlots,
  startingLayouts,
  onGenerate,
  onCancel,
}: LayoutInputsModalProps) {
  if (!open) return null;

  const isGenerating = status?.status === "generating" || status?.status === "queued";
  const isReady = !!status?.generated_at && !isGenerating;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
        onClick={!startingLayouts ? onClose : undefined}
      />
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative w-full max-w-3xl rounded-2xl bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-alloro-orange" />
              <h2 className="text-lg font-bold text-gray-900">Generate Layouts</h2>
              {isReady && (
                <span className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-[10px] font-semibold text-green-700">
                  <Check className="h-3 w-3" /> Ready
                </span>
              )}
              {isGenerating && (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                  <Loader2 className="h-3 w-3 animate-spin" /> Generating
                </span>
              )}
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="px-6 pt-4 pb-2 text-xs text-gray-500">
            Wrapper, header, and footer — generated once, reused across pages.
          </div>

          <div className="max-h-[75vh] overflow-y-auto px-6 pb-6">
            {isGenerating ? (
              <div className="space-y-3 py-4">
                {status?.progress && (
                  <>
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>
                        {status.progress.current_component} ({status.progress.completed}/
                        {status.progress.total})
                      </span>
                      <span>
                        {Math.round((status.progress.completed / status.progress.total) * 100)}%
                      </span>
                    </div>
                    <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-amber-500 rounded-full transition-all duration-500"
                        style={{
                          width: `${(status.progress.completed / status.progress.total) * 100}%`,
                        }}
                      />
                    </div>
                  </>
                )}
                <button
                  onClick={onCancel}
                  className="text-xs font-medium text-red-600 hover:text-red-800 px-3 py-1.5 rounded border border-red-200 hover:bg-red-50"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {loadingSlots ? (
                  <div className="text-xs text-gray-400 flex items-center gap-2 py-6">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Loading layout inputs...
                  </div>
                ) : (
                  <DynamicSlotInputs
                    slots={slots}
                    values={values}
                    onChange={onSlotChange}
                    emptyMessage="No layout slots defined for this template."
                  />
                )}
                <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
                  <button
                    onClick={onClose}
                    className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Close
                  </button>
                  <button
                    onClick={onGenerate}
                    disabled={startingLayouts || slots.length === 0}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-alloro-orange px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
                  >
                    {startingLayouts ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Starting...
                      </>
                    ) : isReady ? (
                      <>
                        <RefreshCw className="h-4 w-4" />
                        Regenerate Layouts
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4" />
                        Generate Layouts
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
