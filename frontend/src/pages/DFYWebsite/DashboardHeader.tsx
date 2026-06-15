import { Link as LinkIcon, ExternalLink } from "lucide-react";
import {
  WebsiteDashboardTabs,
  type WebsiteDashboardView,
} from "../../components/website/WebsiteDashboardTabs";
import type { Project } from "../dfyWebsite.types";
import type { WebsiteTab } from "../dfyWebsite.utils";

interface DashboardHeaderProps {
  project: Project | null;
  liveUrl: string | null;
  activeView: WebsiteTab;
  onConnectDomain: () => void;
  setWebsiteTab: (tab: WebsiteTab) => void;
}

export function DashboardHeader({
  project,
  liveUrl,
  activeView,
  onConnectDomain,
  setWebsiteTab,
}: DashboardHeaderProps) {
  return (
    <div className="mx-auto w-full max-w-[960px] px-4 pt-8 sm:px-6 lg:px-8 lg:pt-10">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-alloro-navy/45">
            Web presence
          </div>
          <h1 className="font-display text-[28px] font-medium tracking-tight text-alloro-navy">
            Website
          </h1>
          <p className="mt-1.5 text-[13px] font-medium leading-relaxed text-alloro-navy/55">
            Traffic, leads, posts, and pages — manage it all in one place.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onConnectDomain}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              project?.custom_domain && project?.domain_verified_at
                ? "bg-green-50 text-green-700 hover:bg-green-100"
                : project?.custom_domain
                  ? "bg-amber-50 text-amber-700 hover:bg-amber-100"
                  : "bg-alloro-orange/10 text-alloro-orange hover:bg-alloro-orange/20"
            }`}
          >
            <LinkIcon className="h-3.5 w-3.5" />
            {project?.custom_domain || "Connect Domain"}
          </button>
          {liveUrl && (
            <a
              href={liveUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-line-soft bg-white px-3 py-1.5 text-xs font-semibold text-alloro-navy/70 transition-colors hover:text-alloro-orange"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              View Live
            </a>
          )}
        </div>
      </div>
      <div className="mt-6">
        {/*
          Tab descriptions moved into the trailing (i) tooltip on the tab bar
          itself (#20, Rev) — replaces the always-on page-vs-post blurb.
        */}
        <WebsiteDashboardTabs
          activeView={activeView as WebsiteDashboardView}
          hasPosts={!!project?.template_id}
          onViewChange={(v) => setWebsiteTab(v)}
        />
      </div>
    </div>
  );
}
