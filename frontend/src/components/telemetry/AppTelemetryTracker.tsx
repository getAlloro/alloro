import { useAppTelemetry } from "../../hooks/useAppTelemetry";

export function AppTelemetryTracker() {
  useAppTelemetry();
  return null;
}
