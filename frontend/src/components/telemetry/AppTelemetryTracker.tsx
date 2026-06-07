import { useAppTelemetry } from "../../hooks/useAppTelemetry";
import { useClarityMonitoring } from "../../hooks/useClarityMonitoring";

export function AppTelemetryTracker() {
  useAppTelemetry();
  useClarityMonitoring();
  return null;
}
