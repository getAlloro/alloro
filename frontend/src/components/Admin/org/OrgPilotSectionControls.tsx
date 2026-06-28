import { Loader2, MonitorPlay, Play, RefreshCw } from "lucide-react";
import type { AdminUser } from "../../../api/admin-organizations";
import type { EmbeddedPilotFrameSession } from "./EmbeddedPilotFrame";

export type PilotSessionControlsProps = {
  activeSession: EmbeddedPilotFrameSession | null;
  isPending: boolean;
  onManualStart: () => void;
  onUserChange: (value: string) => void;
  selectedUser: AdminUser | null;
  selectedUserId: number | null;
  users: AdminUser[];
};

export function OrgPilotSectionControls({
  activeSession,
  isPending,
  onManualStart,
  onUserChange,
  selectedUser,
  selectedUserId,
  users,
}: PilotSessionControlsProps) {
  return (
    <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div className="flex items-center gap-2">
        <MonitorPlay className="h-5 w-5 text-alloro-navy" />
        <h3 className="font-semibold text-gray-900">Pilot</h3>
      </div>

      <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
        <label className="sr-only" htmlFor="pilot-user-select">
          Pilot user
        </label>
        <select
          id="pilot-user-select"
          value={selectedUserId ?? ""}
          onChange={(event) => onUserChange(event.target.value)}
          className="min-h-10 min-w-[240px] rounded-lg border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-700 outline-none transition focus:border-alloro-orange focus:ring-2 focus:ring-alloro-orange/20"
        >
          <option value="">Select user</option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name} · {user.email}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onManualStart}
          disabled={!selectedUser || isPending}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-alloro-navy px-4 text-sm font-bold text-white transition hover:bg-alloro-navy/90 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {getStartIcon(isPending, Boolean(activeSession))}
          {activeSession ? "Restart" : "Start"}
        </button>
      </div>
    </div>
  );
}

function getStartIcon(isPending: boolean, hasActiveSession: boolean) {
  if (isPending) return <Loader2 className="h-4 w-4 animate-spin" />;
  if (hasActiveSession) return <RefreshCw className="h-4 w-4" />;
  return <Play className="h-4 w-4" />;
}
