import { Loader2, Mail, RotateCcw } from "lucide-react";

export type FormRecipientRouteModePickerProps = {
  isCustomMode: boolean;
  isSaving: boolean;
  pendingMode: "default" | "custom" | null;
  onUseDefault: () => void;
  onUseCustom: () => void;
};

export function FormRecipientRouteModePicker({
  isCustomMode,
  isSaving,
  pendingMode,
  onUseDefault,
  onUseCustom,
}: FormRecipientRouteModePickerProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <button
        type="button"
        onClick={onUseDefault}
        disabled={isSaving}
        className={`rounded-lg border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
          !isCustomMode
            ? "border-alloro-orange bg-alloro-orange/5"
            : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
        }`}
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          {pendingMode === "default" ? (
            <Loader2 className="h-4 w-4 animate-spin text-alloro-orange" />
          ) : (
            <RotateCcw className="h-4 w-4 text-alloro-orange" />
          )}
          Use default recipients
        </div>
        <p className="mt-1 text-xs text-gray-500">
          Best for most forms. New forms start here automatically.
        </p>
      </button>
      <button
        type="button"
        onClick={onUseCustom}
        disabled={isSaving}
        className={`rounded-lg border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
          isCustomMode
            ? "border-alloro-orange bg-alloro-orange/5"
            : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
        }`}
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          {pendingMode === "custom" ? (
            <Loader2 className="h-4 w-4 animate-spin text-alloro-orange" />
          ) : (
            <Mail className="h-4 w-4 text-alloro-orange" />
          )}
          Send to specific people
        </div>
        <p className="mt-1 text-xs text-gray-500">
          Use when this form needs its own inbox or team.
        </p>
      </button>
    </div>
  );
}
