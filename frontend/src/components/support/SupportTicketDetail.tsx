import { useState } from "react";
import type { FormEvent } from "react";
import { MessageSquare } from "lucide-react";
import type {
  SupportTicket,
  SupportTicketAttachment,
  SupportTicketMessage,
} from "../../api/support";
import { SupportStatusBadge } from "./SupportStatusBadge";
import { SupportMessageThread } from "./SupportMessageThread";
import { SupportTicketAttachments } from "./SupportTicketAttachments";
import { ticketTypeMeta } from "./supportMeta";

export type SupportTicketDetailProps = {
  ticket?: SupportTicket;
  messages?: SupportTicketMessage[];
  attachments?: SupportTicketAttachment[];
  isLoading: boolean;
  isReplying: boolean;
  onReply: (body: string) => void;
};

export function SupportTicketDetail({
  ticket,
  messages = [],
  attachments = [],
  isLoading,
  isReplying,
  onReply,
}: SupportTicketDetailProps) {
  const [reply, setReply] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!reply.trim()) return;
    onReply(reply.trim());
    setReply("");
  };

  if (isLoading) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03),0_1px_3px_rgba(0,0,0,0.05)] sm:p-6">
        <div className="h-7 w-48 animate-pulse rounded bg-slate-200" />
        <div className="mt-5 space-y-3">
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
      <section className="flex min-h-[420px] flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-[0_1px_2px_rgba(0,0,0,0.03),0_1px_3px_rgba(0,0,0,0.05)]">
        <MessageSquare className="h-9 w-9 text-alloro-orange" />
        <h2 className="mt-4 font-display text-[24px] font-normal text-alloro-navy">
          Select a ticket
        </h2>
        <p className="mt-2 max-w-sm text-[13px] leading-relaxed text-slate-500">
          Choose a request to see status, replies, and next steps.
        </p>
      </section>
    );
  }

  const type = ticketTypeMeta[ticket.type];
  const canReply = !["resolved", "wont_fix", "archived"].includes(
    ticket.status,
  );

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03),0_1px_3px_rgba(0,0,0,0.05)] sm:p-6">
      <div className="mb-5 flex flex-col gap-3 border-b border-slate-100 pb-5">
        <div>
          <SupportStatusBadge status={ticket.status} />
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
            {ticket.publicId} - {type.label}
          </p>
          <h2 className="mt-1 font-display text-[24px] font-normal leading-tight tracking-tight text-alloro-navy">
            {ticket.title}
          </h2>
          {ticket.resolutionNotes && (
            <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-[13px] font-medium leading-relaxed text-emerald-800">
              {ticket.resolutionNotes}
            </p>
          )}
        </div>
      </div>

      <SupportTicketAttachments
        ticketId={ticket.id}
        attachments={attachments}
      />

      <SupportMessageThread messages={messages} maskStaffName />

      {canReply && (
        <form onSubmit={handleSubmit} className="mt-5 space-y-3">
          <label className="sr-only" htmlFor="support-reply">
            Reply to support
          </label>
          <textarea
            id="support-reply"
            value={reply}
            onChange={(event) => setReply(event.target.value)}
            rows={4}
            placeholder="Add a reply or new detail for the support team."
            className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-[13px] font-medium text-alloro-navy placeholder:text-slate-400 focus:border-alloro-orange focus:outline-none focus:ring-4 focus:ring-alloro-orange/15"
          />
          <button
            type="submit"
            disabled={isReplying || !reply.trim()}
            className="rounded-xl bg-alloro-navy px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-white transition hover:brightness-110 focus:outline-none focus:ring-4 focus:ring-alloro-teal/25 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isReplying ? "Sending" : "Reply"}
          </button>
        </form>
      )}
    </section>
  );
}
