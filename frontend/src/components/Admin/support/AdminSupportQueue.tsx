import { Building2 } from "lucide-react";
import type { SupportTicket } from "../../../api/support";
import { ticketTypeMeta } from "../../support/supportMeta";
import { SupportSignalBadge } from "./SupportSignalBadge";

export type AdminSupportGroup = {
  organizationName: string;
  tickets: SupportTicket[];
};

export type AdminSupportQueueProps = {
  groups: AdminSupportGroup[];
  selectedTicketId: string | null;
  isLoading: boolean;
  onSelectTicket: (ticketId: string) => void;
};

export function AdminSupportQueue({
  groups,
  selectedTicketId,
  isLoading,
  onSelectTicket,
}: AdminSupportQueueProps) {
  if (isLoading) {
    return (
      <section className="h-fit rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03),0_1px_3px_rgba(0,0,0,0.05)]">
        <div className="h-6 w-40 animate-pulse rounded bg-slate-200" />
        <div className="mt-4 space-y-2.5">
          {[1, 2, 3, 4].map((item) => (
            <div
              key={item}
              className="h-20 animate-pulse rounded-xl bg-slate-100"
            />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="h-fit rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03),0_1px_3px_rgba(0,0,0,0.05)] xl:sticky xl:top-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="font-display text-[21px] font-normal leading-tight text-alloro-navy">
          Tickets
        </h2>
        <span className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-500">
          {groups.reduce((count, group) => count + group.tickets.length, 0)}
        </span>
      </div>

      {groups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-8 text-center">
          <Building2 className="mx-auto h-8 w-8 text-alloro-orange" />
          <p className="mt-3 text-[13px] font-semibold text-slate-500">
            No matching tickets.
          </p>
        </div>
      ) : (
        <div className="max-h-[calc(100vh-240px)] space-y-4 overflow-y-auto pr-1">
          {groups.map((group) => (
            <div key={group.organizationName}>
              <div className="mb-2 flex items-center justify-between gap-3 px-1">
                <p className="truncate text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                  {group.organizationName}
                </p>
                <span className="text-xs font-semibold text-slate-400">
                  {group.tickets.length}
                </span>
              </div>
              <div className="space-y-2">
                {group.tickets.map((ticket) => {
                  const type = ticketTypeMeta[ticket.type];
                  const isSelected = ticket.id === selectedTicketId;
                  return (
                    <button
                      key={ticket.id}
                      type="button"
                      onClick={() => onSelectTicket(ticket.id)}
                      className={`w-full rounded-xl border p-3 text-left transition hover:border-alloro-orange/60 focus:outline-none focus:ring-4 focus:ring-alloro-orange/15 ${
                        isSelected
                          ? "border-alloro-orange bg-alloro-orange/5"
                          : "border-slate-200 bg-white"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                            {ticket.publicId} - {type.label}
                          </p>
                          <h3 className="mt-1 line-clamp-2 text-[14px] font-semibold leading-snug text-alloro-navy">
                            {ticket.title}
                          </h3>
                        </div>
                        <SupportSignalBadge
                          kind="status"
                          value={ticket.status}
                          compact
                        />
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {ticket.severity && (
                          <SupportSignalBadge
                            kind="severity"
                            value={ticket.severity}
                            compact
                          />
                        )}
                        {ticket.priority && (
                          <SupportSignalBadge
                            kind="priority"
                            value={ticket.priority}
                            compact
                          />
                        )}
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-3 text-[11px] font-medium text-slate-400">
                        <span>Opened {formatDate(ticket.createdAt)}</span>
                        <span>Updated {formatDate(ticket.updatedAt)}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}
