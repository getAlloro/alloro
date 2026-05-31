import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3 } from "lucide-react";
import {
  fetchWebsiteAnalytics,
  type WebsiteAnalytics,
} from "../../../api/websiteAnalytics";
import {
  useIsWizardActive,
  useWizardDemoData,
} from "../../../contexts/OnboardingWizardContext";
import { TrendSparkline } from "../../dashboard/shared/TrendSparkline";
import { OverviewCard, OverviewCardEmptyState } from "./OverviewCard";

const numberFmt = new Intl.NumberFormat("en-US");
const RANGE_DAYS = 90;

function formatShortDate(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function AnalyticsCard({ className }: { className?: string }) {
  const isWizardActive = useIsWizardActive();
  const wizardDemoData = useWizardDemoData();
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  const query = useQuery<WebsiteAnalytics>({
    queryKey: ["websiteAnalytics", RANGE_DAYS],
    queryFn: () => fetchWebsiteAnalytics(RANGE_DAYS),
    enabled: !isWizardActive,
    staleTime: 5 * 60 * 1000,
  });

  const demo = (wizardDemoData?.websiteCardData as Record<string, unknown> | undefined)
    ?.analytics as WebsiteAnalytics | undefined;
  const data = isWizardActive ? demo : query.data;
  const loading = isWizardActive ? false : query.isLoading;
  const failed = !isWizardActive && query.isError;

  const points = (data?.daily ?? []).map((point) => ({
    label: formatShortDate(point.date),
    pageviews: point.pageviews,
  }));

  let body: ReactNode;
  if (loading) {
    body = <div className="h-[182px] animate-pulse rounded-[10px] bg-neutral-100" />;
  } else if (failed || !data || !data.hasIntegration) {
    body = (
      <OverviewCardEmptyState
        icon={<BarChart3 size={20} />}
        title="Analytics not connected"
        hint="Connect web analytics to track sessions, page views, and visitors."
      />
    );
  } else if (data.dataDays === 0) {
    body = (
      <OverviewCardEmptyState
        icon={<BarChart3 size={20} />}
        title="Gathering data"
        hint="Visitor trends appear here within a day or two of your site going live."
      />
    );
  } else {
    const activePoint = activeIdx !== null ? data.daily[activeIdx] : null;
    const displayValue = activePoint ? activePoint.pageviews : data.totals.pageviews;
    const displayLabel = activePoint
      ? formatShortDate(activePoint.date)
      : `Last ${data.dataDays} days`;
    body = (
      <div>
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="font-display text-[32px] font-medium leading-none tracking-tight text-alloro-navy tabular-nums">
            {numberFmt.format(Math.round(displayValue))}
          </span>
          <span className="text-xs font-medium text-[color:var(--color-pm-text-secondary)]">
            page views · {displayLabel}
          </span>
        </div>
        <div className="mt-1 text-xs text-[color:var(--color-pm-text-secondary)]">
          {numberFmt.format(Math.round(data.totals.sessions))} sessions ·{" "}
          {numberFmt.format(Math.round(data.totals.users))} visitors
        </div>
        <div className="mt-4">
          <TrendSparkline
            data={points}
            valueKey="pageviews"
            labelKey="label"
            height={150}
            onActiveIndexChange={setActiveIdx}
          />
        </div>
      </div>
    );
  }

  return (
    <OverviewCard
      className={className}
      eyebrow="Analytics · Last 90 days"
      infoTip="Sessions, page views, and visitors from your website analytics."
    >
      {body}
    </OverviewCard>
  );
}
