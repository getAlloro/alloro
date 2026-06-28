import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "react-hot-toast";
import type {
  AdminOrganizationDetail,
  AdminUser,
} from "../../../api/admin-organizations";
import { useAdminPilotSession } from "../../../hooks/queries/useAdminPilotSession";
import type { EmbeddedPilotFrameSession } from "./EmbeddedPilotFrame";
import { OrgPilotSectionBody } from "./OrgPilotSectionBody";
import { OrgPilotSectionControls } from "./OrgPilotSectionControls";

type OrgPilotSectionProps = {
  isActive: boolean;
  onUserSelect: (userId: number | null) => void;
  org: AdminOrganizationDetail;
  selectedUserId: number | null;
};

export function OrgPilotSection({
  isActive,
  onUserSelect,
  org,
  selectedUserId,
}: OrgPilotSectionProps) {
  const pilotMutation = useAdminPilotSession();
  const autoStartedUserId = useRef<number | null>(null);
  const [activeSession, setActiveSession] =
    useState<EmbeddedPilotFrameSession | null>(null);
  const users = useMemo(() => org.users || [], [org.users]);
  const selectedUser = useMemo(
    () => users.find((user) => user.id === selectedUserId) ?? null,
    [selectedUserId, users]
  );

  const startPilotSession = useCallback(
    async (user: AdminUser) => {
      try {
        const response = await pilotMutation.mutateAsync(user.id);
        if (!response.success || !response.token) {
          toast.error("Pilot session failed");
          return;
        }

        setActiveSession({
          email: response.user?.email || user.email,
          role: user.role || "client",
          token: response.token,
          userId: response.user?.id || user.id,
        });
        toast.success(`Piloting as ${user.name}`);
      } catch (error: unknown) {
        toast.error(getPilotErrorMessage(error));
      }
    },
    [pilotMutation]
  );

  useEffect(() => {
    if (!isActive) return;
    if (!selectedUser) return;
    if (activeSession?.userId === selectedUser.id) return;
    if (autoStartedUserId.current === selectedUser.id) return;

    autoStartedUserId.current = selectedUser.id;
    void startPilotSession(selectedUser);
  }, [activeSession?.userId, isActive, selectedUser, startPilotSession]);

  const handleUserChange = (value: string) => {
    const nextUserId = value ? Number(value) : null;
    onUserSelect(nextUserId);
    setActiveSession(null);
  };

  const handleManualStart = () => {
    if (!selectedUser) {
      toast.error("Select a user to pilot");
      return;
    }
    autoStartedUserId.current = selectedUser.id;
    void startPilotSession(selectedUser);
  };

  const handlePilotEnded = () => {
    setActiveSession(null);
    toast("Pilot session ended");
  };

  return (
    <div className="space-y-5">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-gray-200 bg-white p-6"
      >
        <OrgPilotSectionControls
          activeSession={activeSession}
          isPending={pilotMutation.isPending}
          onManualStart={handleManualStart}
          onUserChange={handleUserChange}
          selectedUser={selectedUser}
          selectedUserId={selectedUserId}
          users={users}
        />
        <OrgPilotSectionBody
          activeSession={activeSession}
          onEnded={handlePilotEnded}
          users={users}
        />
      </motion.div>
    </div>
  );
}

function getPilotErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Pilot session failed";
}
