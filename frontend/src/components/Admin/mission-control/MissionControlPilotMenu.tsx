import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Loader2, LogIn, UserRound } from "lucide-react";
import { toast } from "react-hot-toast";
import type { MissionControlAdminUser } from "../../../api/admin-mission-control";
import { useAdminMissionControlPilotSession } from "../../../hooks/queries/useAdminMissionControlQueries";

export type MissionControlPilotMenuProps = {
  users: MissionControlAdminUser[];
  organizationName: string;
};

export function MissionControlPilotMenu({
  users,
  organizationName,
}: MissionControlPilotMenuProps) {
  const [open, setOpen] = useState(false);
  const pilotMutation = useAdminMissionControlPilotSession();
  const hasUsers = users.length > 0;

  const handlePilot = async (user: MissionControlAdminUser) => {
    try {
      const response = await pilotMutation.mutateAsync(user.id);
      if (!response.success) {
        toast.error("Pilot session failed");
        return;
      }

      openPilotWindow(response.token, response.googleAccountId, user.role);
      toast.success(`Piloting as ${user.name}`);
      setOpen(false);
    } catch (error: unknown) {
      toast.error(getPilotErrorMessage(error));
    }
  };

  return (
    <div
      className="relative shrink-0"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => hasUsers && setOpen((value) => !value)}
        disabled={!hasUsers || pilotMutation.isPending}
        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs font-bold text-alloro-navy transition-all hover:border-alloro-orange/30 hover:bg-alloro-orange/10 disabled:cursor-not-allowed disabled:opacity-45"
        aria-label={`Pilot ${organizationName}`}
        aria-expanded={open}
      >
        {pilotMutation.isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <LogIn className="h-3.5 w-3.5" />
        )}
        Pilot
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            className="absolute right-0 z-30 mt-2 w-64 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl"
          >
            <div className="border-b border-gray-100 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-400">
              Admin users
            </div>
            <div className="max-h-64 overflow-y-auto p-1.5">
              {users.map((user) => (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => handlePilot(user)}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-alloro-orange/10"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-alloro-navy/10 text-alloro-navy">
                    <UserRound className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-black text-alloro-navy">
                      {user.name}
                    </span>
                    <span className="block truncate text-[11px] font-medium text-gray-500">
                      {user.email}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function openPilotWindow(
  token: string,
  googleAccountId: number | null,
  role: string,
) {
  let pilotUrl = `/?pilot_token=${encodeURIComponent(token)}`;
  if (googleAccountId) {
    pilotUrl += `&organization_id=${encodeURIComponent(String(googleAccountId))}`;
  }
  pilotUrl += `&user_role=${encodeURIComponent(role)}`;

  const width = 1280;
  const height = 800;
  const left = (window.screen.width - width) / 2;
  const top = (window.screen.height - height) / 2;

  window.open(
    pilotUrl,
    "Pilot",
    `width=${width},height=${height},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no`,
  );
}

function getPilotErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Pilot session failed";
}
