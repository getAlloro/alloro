import type { ReactNode } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Newspaper,
  Loader2,
  Settings2,
  Sparkles,
} from "lucide-react";

export type AdminGbpView = "settings" | "posts" | "reviews";

export type AdminGbpAutomationHeaderProps = {
  activeView: AdminGbpView;
  isLoadingLocation: boolean;
  isReady: boolean;
  status: string;
  onViewChange: (view: AdminGbpView) => void;
};

const VIEW_OPTIONS: Array<{
  key: AdminGbpView;
  label: string;
  icon: ReactNode;
}> = [
  { key: "reviews", label: "Reviews", icon: <Sparkles className="h-3.5 w-3.5" /> },
  { key: "posts", label: "GBP Posts", icon: <Newspaper className="h-3.5 w-3.5" /> },
  { key: "settings", label: "Settings", icon: <Settings2 className="h-3.5 w-3.5" /> },
];

function statusLabel(status: string): string {
  return status.replaceAll("_", " ");
}

export function AdminGbpAutomationHeader({
  activeView,
  isLoadingLocation,
  isReady,
  status,
  onViewChange,
}: AdminGbpAutomationHeaderProps) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            {isLoadingLocation ? (
              <Loader2 className="h-5 w-5 animate-spin text-alloro-orange" />
            ) : isReady ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            ) : (
              <AlertCircle className="h-5 w-5 text-amber-600" />
            )}
            <h2 className="text-lg font-bold text-gray-900">GBP Automation</h2>
          </div>
          <p className="mt-1 text-sm font-semibold capitalize text-gray-500">
            {isLoadingLocation ? "Loading location" : statusLabel(status)}
          </p>
        </div>
        <nav
          aria-label="GBP automation sections"
          className="flex flex-wrap items-center gap-4 border-b border-gray-200"
        >
          {VIEW_OPTIONS.map((view) => (
            <button
              key={view.key}
              type="button"
              onClick={() => onViewChange(view.key)}
              className={`inline-flex items-center gap-1.5 border-b-2 px-0.5 pb-2 text-xs font-bold transition-colors ${
                activeView === view.key
                  ? "border-alloro-orange text-alloro-navy"
                  : "border-transparent text-gray-500 hover:text-gray-800"
              }`}
            >
              {view.icon}
              {view.label}
            </button>
          ))}
        </nav>
      </div>
    </section>
  );
}
