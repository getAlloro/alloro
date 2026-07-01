import { ArrowLeft, Building2, Loader2 } from "lucide-react";
import {
  telemetryRangeGranularity,
  type MissionControlTelemetryOrganizationDetailData,
} from "../../../../api/admin-mission-control";
import { TelemetryActivityTimeline } from "./TelemetryActivityTimeline";
import { TelemetryBreadcrumb } from "./TelemetryBreadcrumb";
import { TelemetryOrganizationDetailCards } from "./TelemetryOrganizationDetailCards";
import { TelemetrySurfaceList } from "./TelemetrySurfaceList";
import { TelemetryTrendChart } from "./TelemetryTrendChart";
import { TelemetryUserDrilldown } from "./TelemetryUserDrilldown";

export type TelemetryOrganizationDetailViewProps = {
  data: MissionControlTelemetryOrganizationDetailData | undefined;
  isLoading: boolean;
  onBack: () => void;
  onSelectUser: (userId: number) => void;
};

export function TelemetryOrganizationDetailView({
  data,
  isLoading,
  onBack,
  onSelectUser,
}: TelemetryOrganizationDetailViewProps) {
  if (isLoading && !data) {
    return (
      <section className="flex min-h-[360px] items-center justify-center rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center gap-3 text-sm font-bold text-alloro-navy">
          <Loader2 className="h-4 w-4 animate-spin text-alloro-orange" />
          Loading organization telemetry
        </div>
      </section>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to all organizations"
            className="mt-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gray-200 text-gray-500 transition-all hover:border-alloro-teal/40 hover:bg-gray-50 hover:text-alloro-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-alloro-teal/40"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-700">
            <Building2 className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <TelemetryBreadcrumb
              items={[
                {
                  label: "Overview",
                  onClick: onBack,
                  ariaLabel: "Back to telemetry overview",
                },
                { label: data.organization.organizationName },
              ]}
            />
            <h2 className="mt-1 truncate text-xl font-black text-alloro-navy">
              {data.organization.organizationName}
            </h2>
            <p className="mt-1 text-sm font-medium text-gray-500">
              {data.organization.domain || "No domain"} · {data.range}
            </p>
          </div>
        </div>
      </section>

      <TelemetryOrganizationDetailCards
        organization={data.organization}
        summary={data.summary}
      />

      {/* Independent columns (items-start) so the chart card keeps its
          content height instead of stretching to the tall right rail. */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_420px] xl:items-start">
        <div className="min-w-0 space-y-5">
          <TelemetryTrendChart
            data={data.dailyUsage}
            variant="organization"
            granularity={telemetryRangeGranularity(data.range)}
          />
          <TelemetryActivityTimeline movements={data.recentMovements} />
        </div>
        <div className="min-w-0 space-y-5">
          <TelemetrySurfaceList
            surfaces={data.surfaceUsage}
            pages={data.pageUsage}
          />
          <TelemetryUserDrilldown
            organization={data.organization}
            users={data.users}
            isLoading={isLoading}
            onSelectUser={onSelectUser}
          />
        </div>
      </div>
    </div>
  );
}
