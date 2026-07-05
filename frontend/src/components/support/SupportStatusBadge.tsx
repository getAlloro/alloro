import type { SupportTicketStatus } from "../../api/support";
import { statusMeta } from "./supportMeta";

export type SupportStatusBadgeProps = {
  status: SupportTicketStatus;
};

export function SupportStatusBadge({ status }: SupportStatusBadgeProps) {
  const meta = statusMeta[status];
  const Icon = meta.icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 py-1 text-[11px] font-bold ${meta.className}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {meta.label}
    </span>
  );
}
