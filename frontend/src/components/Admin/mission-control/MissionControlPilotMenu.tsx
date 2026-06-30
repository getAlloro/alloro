import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, LogIn, UserRound } from "lucide-react";
import type { MissionControlAdminUser } from "../../../api/admin-mission-control";

export type MissionControlPilotMenuProps = {
  organizationId: number;
  users: MissionControlAdminUser[];
  organizationName: string;
};

export function MissionControlPilotMenu({
  organizationId,
  users,
  organizationName,
}: MissionControlPilotMenuProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const hasUsers = users.length > 0;

  const handlePilot = (user: MissionControlAdminUser) => {
    navigate(`/admin/organizations/${organizationId}?section=pilot&userId=${user.id}`);
    setOpen(false);
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
        disabled={!hasUsers}
        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs font-bold text-alloro-navy transition-all hover:border-alloro-orange/30 hover:bg-alloro-orange/10 disabled:cursor-not-allowed disabled:opacity-45"
        aria-label={`Pilot ${organizationName}`}
        aria-expanded={open}
      >
        <LogIn className="h-3.5 w-3.5" />
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
