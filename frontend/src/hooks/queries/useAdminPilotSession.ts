import { useMutation } from "@tanstack/react-query";
import {
  adminStartPilotSession,
  type PilotSessionResponse,
} from "../../api/admin-organizations";

export function useAdminPilotSession() {
  return useMutation<PilotSessionResponse, Error, number>({
    mutationFn: (userId) => adminStartPilotSession(userId),
  });
}
