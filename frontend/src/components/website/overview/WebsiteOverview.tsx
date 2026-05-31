import { useQuery } from "@tanstack/react-query";
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
      <div>
        <h2 className="font-display text-[22px] font-medium tracking-tight text-alloro-navy">
          Your website at a glance
        </h2>
        <p className="mt-1 text-sm text-[color:var(--color-pm-text-secondary)]">
          Traffic, leads, and everything you manage — in one place.
        </p>
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
