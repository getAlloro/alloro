import { Building2 } from "lucide-react";
import type { MissionControlTelemetryOrganizationRow } from "../../../../api/admin-mission-control";

export type TelemetryOrganizationTableProps = {
  organizations: MissionControlTelemetryOrganizationRow[];
  selectedOrganizationId: number | null;
  onSelectOrganization: (organizationId: number) => void;
};

export function TelemetryOrganizationTable({
  organizations,
  selectedOrganizationId,
  onSelectOrganization,
}: TelemetryOrganizationTableProps) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-start gap-3 border-b border-gray-100 p-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-50 text-sky-700">
          <Building2 className="h-4.5 w-4.5" />
        </span>
        <div>
          <h2 className="text-base font-black text-alloro-navy">
            Organization Usage
          </h2>
          <p className="mt-1 text-xs font-medium text-gray-500">
            Select a row for user-level detail.
          </p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-100 text-left text-xs">
          <thead className="bg-gray-50 text-[10px] font-black uppercase tracking-wider text-gray-400">
            <tr>
              <th className="px-4 py-3">Organization</th>
              <th className="px-4 py-3 text-right">Users</th>
              <th className="px-4 py-3 text-right">Sessions</th>
              <th className="px-4 py-3 text-right">Views</th>
              <th className="px-4 py-3 text-right">Time</th>
              <th className="px-4 py-3">Top Surface</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {organizations.map((organization) => {
              const selected =
                selectedOrganizationId === organization.organizationId;
              return (
                <tr
                  key={organization.organizationId}
                  onClick={() =>
                    onSelectOrganization(organization.organizationId)
                  }
                  className={`cursor-pointer transition-colors ${
                    selected ? "bg-alloro-teal/10" : "hover:bg-gray-50"
                  }`}
                >
                  <td className="px-4 py-3">
                    <p className="font-black text-alloro-navy">
                      {organization.organizationName}
                    </p>
                    <p className="mt-0.5 text-[11px] font-medium text-gray-500">
                      {organization.domain || "No domain"}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-right font-black tabular-nums text-alloro-navy">
                    {organization.activeUsers}
                  </td>
                  <td className="px-4 py-3 text-right font-bold tabular-nums text-gray-600">
                    {organization.sessions}
                  </td>
                  <td className="px-4 py-3 text-right font-bold tabular-nums text-gray-600">
                    {organization.pageViews}
                  </td>
                  <td className="px-4 py-3 text-right font-bold tabular-nums text-gray-600">
                    {organization.activeMinutes}m
                  </td>
                  <td className="px-4 py-3 font-bold text-gray-600">
                    {formatSurface(organization.topSurface)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function formatSurface(value: string | null): string {
  if (!value) return "-";
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
