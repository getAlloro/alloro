import { Users } from "lucide-react";
import {
  EmbeddedPilotFrame,
  type EmbeddedPilotFrameSession,
} from "./EmbeddedPilotFrame";
import type { AdminUser } from "../../../api/admin-organizations";

export type PilotSessionBodyProps = {
  activeSession: EmbeddedPilotFrameSession | null;
  onEnded: () => void;
  users: AdminUser[];
};

export function OrgPilotSectionBody({
  activeSession,
  onEnded,
  users,
}: PilotSessionBodyProps) {
  if (users.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-6 text-sm text-gray-500">
        <div className="mb-2 flex items-center gap-2 font-semibold text-gray-700">
          <Users className="h-4 w-4" />
          No users available
        </div>
        Add an organization user before starting a pilot session.
      </div>
    );
  }

  if (!activeSession) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-8 text-center text-sm text-gray-500">
        Select a user to start a contained pilot session.
      </div>
    );
  }

  return (
    <EmbeddedPilotFrame
      key={activeSession.token}
      session={activeSession}
      onEnded={onEnded}
    />
  );
}
