import type {
  SupportTicketPriority,
  SupportTicketSeverity,
  SupportTicketStatus,
} from "../../../api/support";

export type SupportSignalKind = "status" | "severity" | "priority";
export type SupportSignalShape = "circle" | "diamond" | "square";

export type SupportSignalMeta = {
  label: string;
  dotClass: string;
  badgeClass: string;
  shape: SupportSignalShape;
};

export const statusOptions: Array<{
  value: SupportTicketStatus | "open" | "";
  label: string;
  hint?: string;
}> = [
  { value: "open", label: "Open tickets" },
  { value: "", label: "All statuses" },
  { value: "new", label: "New" },
  { value: "triaged", label: "Triaged" },
  { value: "in_progress", label: "In progress" },
  { value: "waiting_on_client", label: "Waiting on client" },
  { value: "resolved", label: "Resolved" },
  { value: "wont_fix", label: "Closed" },
  { value: "archived", label: "Archived" },
];

export const ticketStatusOptions: Array<{
  value: SupportTicketStatus;
  label: string;
}> = statusOptions.filter(
  (option) => option.value !== "open" && option.value,
) as Array<{
  value: SupportTicketStatus;
  label: string;
}>;

export const severityOptions: Array<{
  value: SupportTicketSeverity;
  label: string;
  hint?: string;
}> = [
  { value: "high", label: "High", hint: "Client cannot move forward" },
  { value: "medium", label: "Medium", hint: "Annoying, but task can continue" },
  { value: "low", label: "Low", hint: "Minor, cosmetic, or polish" },
];

export const priorityOptions: Array<{
  value: SupportTicketPriority;
  label: string;
  hint?: string;
}> = [
  { value: "p0", label: "P0", hint: "Action within 24 hours" },
  { value: "p1", label: "P1", hint: "Current sprint" },
  { value: "p2", label: "P2", hint: "Not urgent" },
  { value: "p3", label: "P3", hint: "Backlog or polish" },
];

export const statusMeta: Record<SupportTicketStatus, SupportSignalMeta> = {
  new: {
    label: "New",
    dotClass: "bg-amber-500",
    badgeClass: "border-amber-200 bg-amber-50 text-amber-700",
    shape: "circle",
  },
  triaged: {
    label: "Triaged",
    dotClass: "bg-sky-500",
    badgeClass: "border-sky-200 bg-sky-50 text-sky-700",
    shape: "diamond",
  },
  in_progress: {
    label: "In progress",
    dotClass: "bg-alloro-orange",
    badgeClass:
      "border-alloro-orange/25 bg-alloro-orange/10 text-alloro-orange",
    shape: "square",
  },
  waiting_on_client: {
    label: "Waiting",
    dotClass: "bg-violet-500",
    badgeClass: "border-violet-200 bg-violet-50 text-violet-700",
    shape: "diamond",
  },
  resolved: {
    label: "Resolved",
    dotClass: "bg-emerald-500",
    badgeClass: "border-emerald-200 bg-emerald-50 text-emerald-700",
    shape: "circle",
  },
  wont_fix: {
    label: "Closed",
    dotClass: "bg-slate-500",
    badgeClass: "border-slate-200 bg-slate-100 text-slate-600",
    shape: "square",
  },
  archived: {
    label: "Archived",
    dotClass: "bg-zinc-500",
    badgeClass: "border-zinc-200 bg-zinc-100 text-zinc-700",
    shape: "diamond",
  },
};

export const severityMeta: Record<SupportTicketSeverity, SupportSignalMeta> = {
  low: {
    label: "Low",
    dotClass: "bg-slate-400",
    badgeClass: "border-slate-200 bg-slate-50 text-slate-600",
    shape: "circle",
  },
  medium: {
    label: "Medium",
    dotClass: "bg-cyan-500",
    badgeClass: "border-cyan-200 bg-cyan-50 text-cyan-700",
    shape: "diamond",
  },
  high: {
    label: "High impact",
    dotClass: "bg-orange-500",
    badgeClass: "border-orange-200 bg-orange-50 text-orange-700",
    shape: "square",
  },
};

export const priorityMeta: Record<SupportTicketPriority, SupportSignalMeta> = {
  p0: {
    label: "P0",
    dotClass: "bg-red-500",
    badgeClass: "border-red-200 bg-red-50 text-red-700",
    shape: "square",
  },
  p1: {
    label: "P1",
    dotClass: "bg-alloro-orange",
    badgeClass:
      "border-alloro-orange/25 bg-alloro-orange/10 text-alloro-orange",
    shape: "diamond",
  },
  p2: {
    label: "P2",
    dotClass: "bg-teal-500",
    badgeClass: "border-teal-200 bg-teal-50 text-teal-700",
    shape: "circle",
  },
  p3: {
    label: "P3",
    dotClass: "bg-slate-400",
    badgeClass: "border-slate-200 bg-slate-50 text-slate-600",
    shape: "circle",
  },
};

export function getSignalMeta(kind: SupportSignalKind, value: string) {
  if (kind === "status") {
    return statusMeta[value as SupportTicketStatus];
  }
  if (kind === "severity") {
    return severityMeta[value as SupportTicketSeverity];
  }
  return priorityMeta[value as SupportTicketPriority];
}
