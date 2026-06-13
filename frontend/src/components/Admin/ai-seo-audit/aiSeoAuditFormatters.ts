import type {
  AiSeoAuditStatus,
  AiSeoExternalMatchState,
  AiSeoResultStatus,
} from "../../../api/aiSeoAudit";

export function toNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatScore(value: string | number | null | undefined): string {
  const parsed = toNumber(value);
  return parsed === null ? "N/A" : `${Math.round(parsed)}`;
}

export function formatPercent(value: string | number | null | undefined): string {
  const parsed = toNumber(value);
  return parsed === null ? "N/A" : `${Math.round(parsed)}%`;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "Not finished";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatLabel(value: string): string {
  return value
    .split(/[_-]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function getRunStatusClass(status: AiSeoAuditStatus): string {
  if (status === "completed") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "failed") return "border-red-200 bg-red-50 text-red-700";
  if (status === "running") return "border-blue-200 bg-blue-50 text-blue-700";
  return "border-amber-200 bg-amber-50 text-amber-700";
}

export function getResultStatusClass(status: AiSeoResultStatus): string {
  if (status === "pass") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "partial") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "fail") return "border-red-200 bg-red-50 text-red-700";
  return "border-gray-200 bg-gray-50 text-gray-600";
}

export function getExternalStateClass(state: AiSeoExternalMatchState): string {
  if (state === "consistent") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (state === "conflicting" || state === "missing_on_site") {
    return "border-red-200 bg-red-50 text-red-700";
  }
  if (state === "external_candidate" || state === "ambiguous_entity") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  return "border-gray-200 bg-gray-50 text-gray-600";
}
