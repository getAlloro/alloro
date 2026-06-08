import { AlertCircle } from "lucide-react";

type TelemetryErrorStateProps = {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function TelemetryErrorState({
  title,
  message,
  actionLabel,
  onAction,
}: TelemetryErrorStateProps) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
      <AlertCircle className="mx-auto h-8 w-8 text-red-600" />
      <h2 className="mt-3 text-lg font-black text-red-900">{title}</h2>
      <p className="mt-2 text-sm font-medium text-red-700">{message}</p>
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="mt-4 rounded-lg bg-red-700 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-red-800"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
