import { Loader2 } from "lucide-react";

export type TelemetryLoadingStateProps = {
  label: string;
};

export function TelemetryLoadingState({ label }: TelemetryLoadingStateProps) {
  return (
    <div className="flex min-h-[420px] items-center justify-center rounded-xl border border-gray-200 bg-white">
      <div className="flex items-center gap-3 text-sm font-bold text-alloro-navy">
        <Loader2 className="h-4 w-4 animate-spin text-alloro-orange" />
        {label}
      </div>
    </div>
  );
}
