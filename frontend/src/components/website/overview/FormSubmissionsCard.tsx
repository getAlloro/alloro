import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Inbox } from "lucide-react";
import { apiGet } from "../../../api";
import { useFormSubmissionsTimeseries } from "../../../hooks/queries/useFormSubmissionsTimeseries";
import type { TimeseriesPoint } from "../../../api/formSubmissionsTimeseries";
import {
  useIsWizardActive,
  useWizardDemoData,
} from "../../../contexts/OnboardingWizardContext";
import { TrendSparkline } from "../../dashboard/shared/TrendSparkline";
import { OverviewCard, OverviewCardEmptyState } from "./OverviewCard";

interface FormStats {
  allCount: number;
  unreadCount: number;
  verifiedCount: number;
  flaggedCount: number;
  blockedCount: number;
}

interface FormStatsResponse extends Partial<FormStats> {
  success: boolean;
  errorMessage?: string;
}

async function fetchFormStats(): Promise<FormStats> {
  const result = (await apiGet({
    path: "/user/website/form-submissions/stats",
  })) as FormStatsResponse;
  if (!result?.success) {
    throw new Error(result?.errorMessage || "Failed to load submission stats");
  }
  return {
    allCount: result.allCount ?? result.verifiedCount ?? 0,
    unreadCount: result.unreadCount ?? 0,
    verifiedCount: result.verifiedCount ?? 0,
    flaggedCount: result.flaggedCount ?? 0,
    blockedCount: result.blockedCount ?? 0,
  };
}

export function FormSubmissionsCard({
  onOpen,
  className,
}: {
  onOpen: () => void;
  className?: string;
}) {
  const isWizardActive = useIsWizardActive();
  const wizardDemoData = useWizardDemoData();
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  const statsQuery = useQuery<FormStats>({
    queryKey: ["formSubmissionsStats"],
    queryFn: fetchFormStats,
    enabled: !isWizardActive,
    staleTime: 5 * 60 * 1000,
  });
  const series = useFormSubmissionsTimeseries("12m");

  const demoStats = (wizardDemoData?.websiteCardData as Record<string, unknown> | undefined)
    ?.stats as FormStats | undefined;
  const demoSeries = (wizardDemoData?.websiteCardData as Record<string, unknown> | undefined)
    ?.timeseries as TimeseriesPoint[] | undefined;

  const stats = isWizardActive ? demoStats : statsQuery.data;
  const rawPoints = isWizardActive ? (demoSeries ?? []) : (series.data ?? []);
  const points = rawPoints.map((point) => ({
    label: point.month,
    // Demo timeseries (and any legacy row) may omit `total`; derive it the same
    // way WebsiteCard does so the sparkline renders during the wizard tour.
    total:
      point.total ??
      point.verified + point.flagged + ((point as { blocked?: number }).blocked ?? 0),
  }));
  const loading = isWizardActive ? false : statsQuery.isLoading || series.isLoading;

  let body: ReactNode;
  if (loading) {
    body = <div className="h-[182px] animate-pulse rounded-[10px] bg-neutral-100" />;
  } else if (!stats && points.length === 0) {
    body = (
      <OverviewCardEmptyState
        icon={<Inbox size={20} />}
        title="No submissions yet"
        hint="Verified leads from your website forms will appear here."
      />
    );
  } else {
    const activePoint = activeIdx !== null ? points[activeIdx] : null;
    const total = activePoint
      ? activePoint.total
      : stats?.allCount ?? stats?.verifiedCount ?? 0;
    const headlineLabel = activePoint ? activePoint.label : "All time";
    body = (
      <div>
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="font-display text-[32px] font-medium leading-none tracking-tight text-alloro-navy tabular-nums">
            {total}
          </span>
          <span className="text-xs font-medium text-[color:var(--color-pm-text-secondary)]">
            submissions · {headlineLabel}
          </span>
        </div>
        <div className="mt-4">
          <TrendSparkline
            data={points}
            valueKey="total"
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
      eyebrow="Form submissions · Last 12 mo"
      infoTip="Leads submitted through your website forms."
      onOpen={onOpen}
      openLabel="View submissions"
    >
      {body}
    </OverviewCard>
  );
}
