import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { MissionControlTelemetryRange } from "../../../../api/admin-mission-control";
import {
  useAdminMissionControlTelemetry,
  useAdminMissionControlTelemetryOrganizationDetail,
  useAdminMissionControlTelemetryUserDetail,
  useAdminMissionControlTelemetryUsers,
} from "../../../../hooks/queries/useAdminMissionControlTelemetryQueries";
import { TelemetryContentSwitch } from "./TelemetryContentSwitch";
import { TelemetryErrorState } from "./TelemetryErrorState";
import { TelemetryLoadingState } from "./TelemetryLoadingState";
import { TelemetryToolbar } from "./TelemetryToolbar";

export function MissionControlTelemetryTab() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [range, setRange] = useState<MissionControlTelemetryRange>("30d");
  // Pilot support-session telemetry is hard-blocked at ingestion and purged
  // from history — nothing left to toggle. Always false.
  const includePilot = false;
  // Admin-surface (Mission Control) activity is never client engagement —
  // no operator control needed, always excluded.
  const includeAdmin = false;
  const detailOrganizationId = parseDetailId(searchParams.get("org"));
  const detailUserId = parseDetailId(searchParams.get("user"));
  const [selectedOrganizationId, setSelectedOrganizationId] = useState<
    number | null
  >(null);
  const telemetryQuery = useAdminMissionControlTelemetry(
    range,
    includePilot,
    includeAdmin,
  );
  const data = telemetryQuery.data;
  const organizations = useMemo(
    () => data?.organizationUsage ?? [],
    [data?.organizationUsage],
  );

  useEffect(() => {
    if (detailOrganizationId) {
      setSelectedOrganizationId(detailOrganizationId);
    }
  }, [detailOrganizationId]);

  useEffect(() => {
    if (detailOrganizationId) return;
    if (organizations.length === 0) {
      setSelectedOrganizationId(null);
      return;
    }
    const stillPresent = organizations.some(
      (organization) => organization.organizationId === selectedOrganizationId,
    );
    if (!stillPresent) {
      setSelectedOrganizationId(organizations[0].organizationId);
    }
  }, [detailOrganizationId, organizations, selectedOrganizationId]);

  const detailQuery = useAdminMissionControlTelemetryOrganizationDetail(
    detailOrganizationId,
    range,
    includePilot,
    includeAdmin,
  );

  const userDetailQuery = useAdminMissionControlTelemetryUserDetail(
    detailOrganizationId,
    detailUserId,
    range,
    includePilot,
    includeAdmin,
  );

  const usersQuery = useAdminMissionControlTelemetryUsers(
    detailOrganizationId ? null : selectedOrganizationId,
    range,
    includePilot,
    includeAdmin,
  );
  const selectedOrganization =
    organizations.find(
      (organization) => organization.organizationId === selectedOrganizationId,
    ) ?? null;

  const handleOpenOrganizationDetail = (organizationId: number) => {
    setSelectedOrganizationId(organizationId);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("tab", "telemetry");
    nextParams.set("org", String(organizationId));
    setSearchParams(nextParams);
  };

  const handleOpenUserDetail = (userId: number) => {
    const organizationId = detailOrganizationId ?? selectedOrganizationId;
    if (!organizationId) return;
    setSelectedOrganizationId(organizationId);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("tab", "telemetry");
    nextParams.set("org", String(organizationId));
    nextParams.set("user", String(userId));
    setSearchParams(nextParams);
  };

  const handleBackToOrganizations = () => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("org");
    nextParams.delete("user");
    setSearchParams(nextParams);
  };

  const handleBackToOrganizationDetail = () => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("user");
    setSearchParams(nextParams);
  };

  const handleRefreshTelemetry = () => {
    void telemetryQuery.refetch();
    if (detailUserId) {
      void userDetailQuery.refetch();
      return;
    }
    if (detailOrganizationId) {
      void detailQuery.refetch();
      return;
    }
    void usersQuery.refetch();
  };

  if (!detailOrganizationId && telemetryQuery.isLoading && !data) {
    return <TelemetryLoadingState label="Loading telemetry" />;
  }

  if (!detailOrganizationId && (telemetryQuery.isError || !data)) {
    return (
      <TelemetryErrorState
        title="Telemetry did not load"
        message={
          telemetryQuery.error?.message ||
          "The telemetry aggregate endpoint returned an error."
        }
      />
    );
  }

  return (
    <div className="space-y-5">
      <TelemetryToolbar
        range={range}
        isFetching={
          telemetryQuery.isFetching ||
          detailQuery.isFetching ||
          userDetailQuery.isFetching
        }
        onRangeChange={setRange}
        onRefresh={handleRefreshTelemetry}
      />

      <TelemetryContentSwitch
        detailOrganizationId={detailOrganizationId}
        detailUserId={detailUserId}
        aggregateData={data}
        organizations={organizations}
        selectedOrganization={selectedOrganization}
        selectedOrganizationId={selectedOrganizationId}
        users={usersQuery.data?.users ?? []}
        isUsersLoading={usersQuery.isLoading || usersQuery.isFetching}
        organizationDetailData={detailQuery.data}
        isOrganizationDetailError={detailQuery.isError}
        organizationDetailErrorMessage={detailQuery.error?.message}
        isOrganizationDetailLoading={
          detailQuery.isLoading || detailQuery.isFetching
        }
        userDetailData={userDetailQuery.data}
        isUserDetailError={userDetailQuery.isError}
        userDetailErrorMessage={userDetailQuery.error?.message}
        isUserDetailLoading={
          userDetailQuery.isLoading || userDetailQuery.isFetching
        }
        onBackToOrganizations={handleBackToOrganizations}
        onBackToOrganization={handleBackToOrganizationDetail}
        onSelectOrganization={handleOpenOrganizationDetail}
        onSelectUser={handleOpenUserDetail}
      />
    </div>
  );
}

function parseDetailId(value: string | null): number | null {
  if (!value) return null;
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}
