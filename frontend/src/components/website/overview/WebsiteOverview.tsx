import { useQuery } from "@tanstack/react-query";
import { Link as LinkIcon, ExternalLink } from "lucide-react";
import { apiGet } from "../../../api";
import { useIsWizardActive } from "../../../contexts/OnboardingWizardContext";
import { AnalyticsCard } from "./AnalyticsCard";
import { FormSubmissionsCard } from "./FormSubmissionsCard";
import { OverviewCard, OverviewStat } from "./OverviewCard";

export type WebsiteOverviewTab =
  | "editor"
  | "submissions"
  | "posts"
  | "menus"
  | "pages";

export type WebsiteOverviewProps = {
  pageCount: number;
  templateId: string | null;
  liveUrl: string | null;
  customDomain: string | null;
  domainVerified: boolean;
  onConnectDomain: () => void;
  onOpenTab: (tab: WebsiteOverviewTab) => void;
};

interface ListResponse {
  success: boolean;
  data?: unknown[];
}

async function fetchCount(path: string): Promise<number> {
  const result = (await apiGet({ path })) as ListResponse;
  return result?.data?.length ?? 0;
}

export function WebsiteOverview({
  pageCount,
  templateId,
  liveUrl,
  customDomain,
  domainVerified,
  onConnectDomain,
  onOpenTab,
}: WebsiteOverviewProps) {
  const isWizardActive = useIsWizardActive();

  const postsQuery = useQuery<number>({
    queryKey: ["websiteOverviewPostsCount"],
    queryFn: () => fetchCount("/user/website/posts"),
    enabled: !isWizardActive && !!templateId,
    staleTime: 5 * 60 * 1000,
  });

  const menusQuery = useQuery<number>({
    queryKey: ["websiteOverviewMenusCount"],
    queryFn: () => fetchCount("/user/website/menus"),
    enabled: !isWizardActive,
    staleTime: 5 * 60 * 1000,
  });

  const postsCount = isWizardActive ? 6 : postsQuery.data ?? 0;
  const menusCount = isWizardActive ? 2 : menusQuery.data ?? 0;

  return (
    <div
      className="pm-light mx-auto w-full max-w-[1320px] space-y-6 px-4 py-8 sm:px-6 lg:px-8 lg:py-10"
      data-wizard-target="website-overview"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-[22px] font-medium tracking-tight text-alloro-navy">
            Your website at a glance
          </h2>
          <p className="mt-1 text-sm text-[color:var(--color-pm-text-secondary)]">
            Traffic, leads, and everything you manage — in one place.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onConnectDomain}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              customDomain && domainVerified
                ? "bg-green-50 text-green-700 hover:bg-green-100"
                : customDomain
                  ? "bg-amber-50 text-amber-700 hover:bg-amber-100"
                  : "bg-alloro-orange/10 text-alloro-orange hover:bg-alloro-orange/20"
            }`}
          >
            <LinkIcon className="h-3.5 w-3.5" />
            {customDomain || "Connect Domain"}
          </button>
          {liveUrl ? (
            <a
              href={liveUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-line-soft bg-white px-3 py-1.5 text-xs font-semibold text-alloro-navy/70 transition-colors hover:text-alloro-orange"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              View Live
            </a>
          ) : null}
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        <AnalyticsCard className="xl:col-span-2" />
        <FormSubmissionsCard onOpen={() => onOpenTab("submissions")} />

        <OverviewCard
          eyebrow="Pages"
          infoTip="Every page on your website."
          onOpen={() => onOpenTab("pages")}
          openLabel="Manage pages"
        >
          <OverviewStat value={pageCount} unit={pageCount === 1 ? "page" : "pages"} />
        </OverviewCard>

        <OverviewCard
          eyebrow="Posts"
          infoTip="Blog posts and articles published on your site."
          onOpen={templateId ? () => onOpenTab("posts") : undefined}
          openLabel="Manage posts"
        >
          {templateId ? (
            <OverviewStat
              value={postsCount}
              unit={postsCount === 1 ? "post" : "posts"}
            />
          ) : (
            <p className="text-[13px] leading-relaxed text-[color:var(--color-pm-text-secondary)]">
              Blog posts aren't enabled for this website yet.
            </p>
          )}
        </OverviewCard>

        <OverviewCard
          eyebrow="Menus"
          infoTip="Navigation menus that organize your site."
          onOpen={() => onOpenTab("menus")}
          openLabel="Manage menus"
        >
          <OverviewStat value={menusCount} unit={menusCount === 1 ? "menu" : "menus"} />
        </OverviewCard>
      </div>
    </div>
  );
}
