import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { AlertCircle, Loader2, SatelliteDish } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { toast } from "react-hot-toast";
import { CreateOrganizationModal } from "../../components/Admin/CreateOrganizationModal";
import { MissionControlHeader } from "../../components/Admin/mission-control/MissionControlHeader";
import type { MissionControlFilter } from "../../components/Admin/mission-control/MissionControlHeader";
import { MissionControlInsightPanel } from "../../components/Admin/mission-control/MissionControlInsightPanel";
import { MissionControlPaymentWatch } from "../../components/Admin/mission-control/MissionControlPaymentWatch";
import { MissionControlRevenueTrend } from "../../components/Admin/mission-control/MissionControlRevenueTrend";
import { MissionControlSummary } from "../../components/Admin/mission-control/MissionControlSummary";
import {
  MissionControlViewTabs,
  type MissionControlView,
} from "../../components/Admin/mission-control/MissionControlViewTabs";
import { MissionControlTelemetryTab } from "../../components/Admin/mission-control/telemetry/MissionControlTelemetryTab";
import { OrganizationMissionCard } from "../../components/Admin/mission-control/OrganizationMissionCard";
import {
  useAdminMissionControl,
  useRefreshAdminMissionControl,
} from "../../hooks/queries/useAdminMissionControlQueries";
import type { MissionControlOrganization } from "../../api/admin-mission-control";

export default function MissionControl() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<MissionControlFilter>("all");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const activeView: MissionControlView =
    searchParams.get("tab") === "telemetry" ? "telemetry" : "overview";
  const missionControlQuery = useAdminMissionControl();
  const refreshMutation = useRefreshAdminMissionControl();
  const data = missionControlQuery.data;
  const activeOrganizations = useMemo(() => {
    if (!data) return [];
    return data.organizations.filter(
      (organization) => !organization.archivedAt && !organization.isTest,
    );
  }, [data]);

  const organizations = useMemo(() => {
    if (!data) return [];
    return filterOrganizations(data.organizations, search, filter);
  }, [data, filter, search]);

  const handleRefresh = async () => {
    try {
      await refreshMutation.mutateAsync();
      toast.success("Mission Control refreshed");
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Failed to refresh Mission Control"));
    }
  };

  const handleCreated = async () => {
    await refreshMutation.mutateAsync();
  };

  const handleViewChange = (view: MissionControlView) => {
    const nextParams = new URLSearchParams(searchParams);
    if (view === "telemetry") nextParams.set("tab", "telemetry");
    else nextParams.delete("tab");
    setSearchParams(nextParams);
  };

  if (activeView === "overview" && missionControlQuery.isLoading && !data) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-5 py-4 text-sm font-bold text-alloro-navy shadow-sm">
          <Loader2 className="h-4 w-4 animate-spin text-alloro-orange" />
          Loading Mission Control
        </div>
      </div>
    );
  }

  if (activeView === "overview" && (missionControlQuery.isError || !data)) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-6">
        <div className="max-w-md rounded-xl border border-red-200 bg-red-50 p-6 text-center shadow-sm">
          <AlertCircle className="mx-auto h-8 w-8 text-red-600" />
          <h1 className="mt-3 text-lg font-black text-red-900">
            Mission Control did not load
          </h1>
          <p className="mt-2 text-sm leading-6 text-red-700">
            {missionControlQuery.error?.message ||
              "The aggregate admin dashboard endpoint returned an error."}
          </p>
          <button
            onClick={() => missionControlQuery.refetch()}
            className="mt-4 rounded-lg bg-red-700 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-red-800"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="-m-6 min-h-screen bg-[#f6f8fb] px-4 pb-12 pt-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-5">
        <MissionControlHeader
          organizationCount={activeOrganizations.length}
          search={search}
          filter={filter}
          isRefreshing={
            refreshMutation.isPending || missionControlQuery.isFetching
          }
          subtitle={
            activeView === "telemetry"
              ? "First-party product usage across organizations, users, pages, and sessions."
              : undefined
          }
          showOrganizationControls={activeView === "overview"}
          onSearchChange={setSearch}
          onFilterChange={setFilter}
          onRefresh={handleRefresh}
          onCreate={() => setShowCreateModal(true)}
        />

        <MissionControlViewTabs
          activeView={activeView}
          onChange={handleViewChange}
        />

        {activeView === "telemetry" ? (
          <MissionControlTelemetryTab />
        ) : (
          <>
            <MissionControlSummary summary={data!.summary} />

            {data!.stripeFreshness === "unavailable" && (
              <div className="rounded-xl border border-alloro-orange/25 bg-alloro-orange/10 px-4 py-3 text-sm font-semibold text-alloro-navy">
                Stripe is unavailable. Revenue values are shown in degraded mode until
                Stripe can be reached.
              </div>
            )}

            <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
              <section className="min-w-0">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-black text-alloro-navy">
                      Client Grid
                    </h2>
                    <p className="mt-1 text-xs font-medium text-gray-500">
                      {organizations.length} clients shown
                    </p>
                  </div>
                </div>

                {organizations.length === 0 ? (
                  <div className="flex min-h-[320px] items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white">
                    <div className="text-center">
                      <SatelliteDish className="mx-auto h-8 w-8 text-gray-300" />
                      <p className="mt-3 text-sm font-bold text-gray-600">
                        No organizations match this view.
                      </p>
                    </div>
                  </div>
                ) : (
                  <motion.div
                    initial="hidden"
                    animate="show"
                    variants={{
                      hidden: {},
                      show: { transition: { staggerChildren: 0.03 } },
                    }}
                    className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3"
                  >
                    {organizations.map((organization, index) => (
                      <OrganizationMissionCard
                        key={organization.id}
                        organization={organization}
                        index={index}
                      />
                    ))}
                  </motion.div>
                )}
              </section>

              <aside className="space-y-5">
                <MissionControlRevenueTrend data={data!.revenueTrend} />
                <MissionControlPaymentWatch organizations={activeOrganizations} />
                <MissionControlInsightPanel data={data!} />
              </aside>
            </div>
          </>
        )}
      </div>

      <CreateOrganizationModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={handleCreated}
      />
    </div>
  );
}

function filterOrganizations(
  organizations: MissionControlOrganization[],
  search: string,
  filter: MissionControlFilter,
): MissionControlOrganization[] {
  const normalizedSearch = search.trim().toLowerCase();

  return organizations
    .filter((organization) => {
      if (!normalizedSearch) return true;
      return [organization.name, organization.domain ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch);
    })
    .filter((organization) => {
      if (filter === "test") return organization.isTest;
      if (organization.isTest) return false;
      if (filter === "archived") return Boolean(organization.archivedAt);
      if (organization.archivedAt) return false;
      if (filter === "all") return true;
      if (filter === "no-payment-method") {
        return organization.riskFlags.includes("no_payment_method");
      }
      if (filter === "active-stripe") {
        return (
          organization.stripeStatus === "active" ||
          organization.stripeStatus === "trialing"
        );
      }
      return organization.stripeStatus === "admin_granted";
    });
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
