import { Loader2, UserRound } from "lucide-react";
import type {
  MissionControlTelemetryOrganizationRow,
  MissionControlTelemetryUserRow,
} from "../../../../api/admin-mission-control";

export type TelemetryUserDrilldownProps = {
  organization: MissionControlTelemetryOrganizationRow | null;
  users: MissionControlTelemetryUserRow[];
  isLoading: boolean;
};

export function TelemetryUserDrilldown({
  organization,
  users,
  isLoading,
}: TelemetryUserDrilldownProps) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-start justify-between gap-3 border-b border-gray-100 p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-alloro-navy/5 text-alloro-navy">
            <UserRound className="h-4.5 w-4.5" />
          </span>
          <div>
            <h2 className="text-base font-black text-alloro-navy">
              User Drilldown
            </h2>
            <p className="mt-1 text-xs font-medium text-gray-500">
              {organization?.organizationName || "No organization selected"}
            </p>
          </div>
        </div>
        {isLoading && <Loader2 className="h-4 w-4 animate-spin text-alloro-orange" />}
      </div>

      <div className="p-4">
        {!organization ? (
          <EmptyState label="Select an organization." />
        ) : users.length === 0 && !isLoading ? (
          <EmptyState label="No tracked user activity in this range." />
        ) : (
          <div className="space-y-2">
            {users.map((user) => (
              <div key={user.userId} className="rounded-lg bg-gray-50 px-3 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-black text-alloro-navy">
                      {user.name || user.email}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] font-medium text-gray-500">
                      {user.email}
                    </p>
                  </div>
                  <span className="rounded-full bg-white px-2 py-1 text-[10px] font-black uppercase tracking-wider text-gray-500">
                    {user.role || "user"}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px]">
                  <MiniStat label="Sessions" value={user.sessions} />
                  <MiniStat label="Views" value={user.pageViews} />
                  <MiniStat label="Time" value={`${user.activeMinutes}m`} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md bg-white px-2 py-2">
      <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">
        {label}
      </p>
      <p className="mt-1 font-black tabular-nums text-alloro-navy">{value}</p>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex min-h-[220px] items-center justify-center rounded-lg border border-dashed border-gray-200 bg-gray-50 text-sm font-bold text-gray-500">
      {label}
    </div>
  );
}
