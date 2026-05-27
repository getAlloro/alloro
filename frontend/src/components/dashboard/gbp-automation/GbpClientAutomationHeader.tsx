import {
  AlertCircle,
  MessageSquareText,
  Newspaper,
  Settings2,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import type {
  GbpAutomationSettings,
  GbpReadiness,
  GbpReadinessStatus,
} from "../../../api/gbpAutomation";

export type ClientGbpView = "reviews" | "posts" | "settings";

export type GbpClientAutomationHeaderProps = {
  activeView: ClientGbpView;
  readiness: GbpReadiness;
  settings: GbpAutomationSettings;
  onViewChange: (view: ClientGbpView) => void;
};

const READINESS_COPY: Record<GbpReadinessStatus, string> = {
  ready: "GBP replies are ready for this location.",
  feature_disabled: "GBP review replies are off until someone enables them.",
  location_not_found: "Select a valid location before using GBP replies.",
  reconnect_required: "Reconnect Google before Alloro can publish replies.",
  missing_gbp_property: "Select the GBP profile for this location.",
  missing_business_manage_scope: "Reconnect Google with Business Profile permissions.",
  no_replyable_reviews: "No unreplied OAuth-synced reviews are ready yet.",
  maps_only_reviews: "Maps/Apify-only reviews cannot be replied to from Alloro.",
};

const VIEW_OPTIONS: Array<{
  key: ClientGbpView;
  label: string;
  icon: LucideIcon;
}> = [
  { key: "reviews", label: "Reviews", icon: Sparkles },
  { key: "posts", label: "GBP Posts", icon: Newspaper },
  { key: "settings", label: "Settings", icon: Settings2 },
];

export function GbpClientAutomationHeader({
  activeView,
  readiness,
  onViewChange,
}: GbpClientAutomationHeaderProps) {
  const shouldShowReadinessAlert = !readiness.ready;

  return (
    <>
      <div>
        <div>
          <div className="flex items-center gap-2 text-alloro-navy">
            <MessageSquareText size={18} />
            <h2 className="font-display text-lg font-medium tracking-tight">
              Alloro Engage™
            </h2>
          </div>
          <p className="mt-1 text-sm font-medium text-slate-500">
            Choose reviews, polish replies, and publish them to Google.
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-4 border-b border-slate-200">
        {VIEW_OPTIONS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => onViewChange(key)}
            className={`inline-flex items-center gap-1.5 border-b-2 px-0.5 pb-2 text-xs font-bold transition-colors ${
              activeView === key
                ? "border-alloro-orange text-alloro-navy"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {shouldShowReadinessAlert && (
        <div className="mt-4 rounded-[10px] border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800">
          <p className="flex items-center gap-2 text-sm font-black">
            <AlertCircle size={14} />
            {READINESS_COPY[readiness.status]}
          </p>
          {readiness.actions.map((action) => (
            <p key={action} className="mt-1 text-xs font-bold opacity-80">
              {action}
            </p>
          ))}
        </div>
      )}
    </>
  );
}
