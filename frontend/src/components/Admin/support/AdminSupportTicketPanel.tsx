import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type {
  AdminSupportAssignee,
  AdminSupportTicketUpdatePayload,
  SupportMessageVisibility,
  SupportTicket,
  SupportTicketAttachment,
  SupportTicketMessage,
} from "../../../api/support";
import { SupportMessageThread } from "../../support/SupportMessageThread";
import { SupportTicketAttachments } from "../../support/SupportTicketAttachments";
import { ticketTypeMeta } from "../../support/supportMeta";
import { AdminSupportReplyForm } from "./AdminSupportReplyForm";
import { AdminSupportTriageForm } from "./AdminSupportTriageForm";
import { SupportSignalBadge } from "./SupportSignalBadge";

export type AdminSupportTicketPanelProps = {
  ticket?: SupportTicket;
  messages?: SupportTicketMessage[];
  attachments?: SupportTicketAttachment[];
  isLoading: boolean;
  isUpdating: boolean;
  isMessaging: boolean;
  assignees: AdminSupportAssignee[];
  onUpdate: (payload: AdminSupportTicketUpdatePayload) => void;
  onMessage: (body: string, visibility: SupportMessageVisibility) => void;
};

export function AdminSupportTicketPanel({
  ticket,
  messages = [],
  attachments = [],
  isLoading,
  isUpdating,
  isMessaging,
  assignees,
  onUpdate,
  onMessage,
}: AdminSupportTicketPanelProps) {
  const [form, setForm] = useState<AdminSupportTicketUpdatePayload>({});
  const [message, setMessage] = useState("");
  const [visibility, setVisibility] =
    useState<SupportMessageVisibility>("client_visible");

  useEffect(() => {
    if (!ticket) return;
    setForm({
      status: ticket.status,
      severity: ticket.severity || "medium",
      priority: ticket.priority || "p2",
      assignedToUserId: ticket.assignedToUserId || null,
      targetSprint: ticket.targetSprint || "",
      internalNotes: ticket.internalNotes || "",
      resolutionNotes: ticket.resolutionNotes || "",
    });
  }, [ticket]);

  const handleUpdate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onUpdate(form);
  };

  const handleMessage = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!message.trim()) return;
    onMessage(message.trim(), visibility);
    setMessage("");
  };

  if (isLoading) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03),0_1px_3px_rgba(0,0,0,0.05)] sm:p-6">
        <div className="h-8 w-64 animate-pulse rounded bg-slate-200" />
        <div className="mt-5 grid gap-3 lg:grid-cols-3">
          {[1, 2, 3].map((item) => (
            <div
              key={item}
              className="h-20 animate-pulse rounded-xl bg-slate-100"
            />
          ))}
        </div>
      </section>
    );
  }

  if (!ticket) {
    return (
      <section className="flex min-h-[520px] items-center justify-center rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-[0_1px_2px_rgba(0,0,0,0.03),0_1px_3px_rgba(0,0,0,0.05)]">
        <p className="max-w-sm text-[13px] font-medium leading-relaxed text-slate-500">
          Select a ticket to triage status, reply, or add notes.
        </p>
      </section>
    );
  }

  const type = ticketTypeMeta[ticket.type];

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03),0_1px_3px_rgba(0,0,0,0.05)] sm:p-6">
      <div className="mb-5 flex flex-col gap-4 border-b border-slate-100 pb-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
            {ticket.publicId} - {type.label}
          </p>
          <h2 className="mt-1 font-display text-[24px] font-normal leading-tight tracking-tight text-alloro-navy">
            {ticket.title}
          </h2>
          <p className="mt-2 text-[13px] font-medium text-slate-500">
            {ticket.organizationName || "Client"} - {ticket.createdByEmail}
          </p>
          <div className="mt-3 flex flex-wrap gap-3 text-[11px] font-medium text-slate-400">
            <span>Opened {formatDateTime(ticket.createdAt)}</span>
            <span>Updated {formatDateTime(ticket.updatedAt)}</span>
            {ticket.latestMessageAt && (
              <span>Latest reply {formatDateTime(ticket.latestMessageAt)}</span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          <SupportSignalBadge kind="status" value={ticket.status} />
          {ticket.severity && (
            <SupportSignalBadge kind="severity" value={ticket.severity} />
          )}
          {ticket.priority && (
            <SupportSignalBadge kind="priority" value={ticket.priority} />
          )}
        </div>
      </div>

      <AdminSupportTriageForm
        form={form}
        assignees={assignees}
        isUpdating={isUpdating}
        onFormChange={setForm}
        onSubmit={handleUpdate}
      />

      <div className="mt-6 grid gap-5 xl:grid-cols-[1fr_340px]">
        <div>
          <SupportTicketAttachments
            ticketId={ticket.id}
            attachments={attachments}
            isAdmin
          />
          <SupportMessageThread messages={messages} />
        </div>
        <AdminSupportReplyForm
          message={message}
          visibility={visibility}
          isMessaging={isMessaging}
          onMessageChange={setMessage}
          onVisibilityChange={setVisibility}
          onSubmit={handleMessage}
        />
      </div>
    </section>
  );
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
