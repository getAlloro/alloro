/**
 * SupportReplica — visual replica of the Help page (frontend/src/pages/Help.tsx)
 *
 * Inlines: SupportTicketList, SupportTicketDetail, SupportStatusBadge,
 *          SupportMessageThread, supportMeta (ticketTypeMeta + statusMeta)
 *
 * Stripped: useSupportTickets, useSupportTicket, useCreateSupportTicket,
 *           useCreateSupportTicketMessage, useSearchParams, toast, reply form
 *           onSubmit, modal state, SupportTicketAttachments, SupportTicketComposerModal
 *
 * Hotspot IDs: header, new-ticket-btn, ticket-list, ticket-detail
 */
import {
  AlertCircle,
  Archive,
  CheckCircle2,
  Clock3,
  Code2,
  Download,
  FileText,
  Globe2,
  LifeBuoy,
  Lightbulb,
  MessageSquare,
  Paperclip,
  PauseCircle,
  Plus,
  XCircle,
} from "lucide-react";
import type { ReplicaProps } from "../../types/docs";
import { DashboardLayout } from "./DashboardLayout";
import { HotspotZone } from "../HotspotZone";

/* ── ticket type meta (from supportMeta.ts) ───────────────────────── */

const ticketTypeMeta = {
  bug_report: { label: "Bug report", icon: Code2 },
  website_edit: { label: "Website edit", icon: Globe2 },
  feature_request: { label: "Feature request", icon: Lightbulb },
} as const;

/* ── status meta (from supportMeta.ts) ────────────────────────────── */

const statusMeta = {
  new: {
    label: "New",
    icon: MessageSquare,
    className: "border-amber-200 bg-amber-50 text-amber-700",
  },
  triaged: {
    label: "Triaged",
    icon: Clock3,
    className: "border-sky-200 bg-sky-50 text-sky-700",
  },
  in_progress: {
    label: "In progress",
    icon: AlertCircle,
    className: "border-alloro-orange/30 bg-alloro-orange/10 text-alloro-orange",
  },
  waiting_on_client: {
    label: "Waiting on you",
    icon: PauseCircle,
    className: "border-violet-200 bg-violet-50 text-violet-700",
  },
  resolved: {
    label: "Resolved",
    icon: CheckCircle2,
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  wont_fix: {
    label: "Closed",
    icon: XCircle,
    className: "border-slate-200 bg-slate-100 text-slate-600",
  },
  archived: {
    label: "Archived",
    icon: Archive,
    className: "border-zinc-200 bg-zinc-100 text-zinc-700",
  },
} as const;

type TicketStatus = keyof typeof statusMeta;
type TicketType = keyof typeof ticketTypeMeta;

/* ── hardcoded tickets ────────────────────────────────────────────── */

interface MockTicket {
  id: string;
  publicId: string;
  type: TicketType;
  title: string;
  status: TicketStatus;
  updatedAt: string;
}

const tickets: MockTicket[] = [
  {
    id: "1",
    publicId: "SUP-001",
    type: "bug_report",
    title: "Rankings not updating after GBP reconnect",
    status: "new",
    updatedAt: "May 15, 6:30 PM",
  },
  {
    id: "2",
    publicId: "SUP-002",
    type: "website_edit",
    title: "Homepage hero image broken on mobile Safari",
    status: "in_progress",
    updatedAt: "May 14, 5:00 PM",
  },
  {
    id: "3",
    publicId: "SUP-003",
    type: "feature_request",
    title: "How do I add a team member?",
    status: "resolved",
    updatedAt: "May 9, 12:00 AM",
  },
];

const selectedTicket = tickets[0]!;

/* ── hardcoded messages ───────────────────────────────────────────── */

interface MockMessage {
  id: string;
  authorRole: "client" | "support";
  authorName: string;
  body: string;
  createdAt: string;
}

const messages: MockMessage[] = [
  {
    id: "m1",
    authorRole: "client",
    authorName: "You",
    body: "After I reconnected my Google Business Profile, the rankings page still shows old data from last week. I expected it to refresh.",
    createdAt: "May 15, 6:30 PM",
  },
  {
    id: "m2",
    authorRole: "support",
    authorName: "Alloro Support",
    body: "Thanks for flagging this. We pushed a cache-clear for your account — rankings should refresh within the hour. Let us know if the issue persists.",
    createdAt: "2 hours ago",
  },
];

/* ── inline StatusBadge (from SupportStatusBadge.tsx) ─────────────── */

function StatusBadge({ status }: { status: TicketStatus }) {
  const meta = statusMeta[status];
  const Icon = meta.icon;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-bold ${meta.className}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {meta.label}
    </span>
  );
}

/* ── component ────────────────────────────────────────────────────── */

export function SupportReplica({
  hotspots,
  activeHotspotId,
  onHotspotClick,
}: ReplicaProps) {
  const findHotspot = (id: string) => hotspots.find((h) => h.id === id);

  const selectedType = ticketTypeMeta[selectedTicket.type];

  return (
    <DashboardLayout activeItem="support">
      {/* ── page chrome (mirrors Help.tsx root wrapper) ─────────── */}
      <div className="pm-light min-h-screen bg-[var(--color-pm-bg-primary)] font-body text-alloro-navy">
        <div className="mx-auto w-full max-w-[1320px] space-y-6 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
          {/* ── header ─────────────────────────────────────────── */}
          <HotspotZone
            id="header"
            hotspot={findHotspot("header")}
            isActive={activeHotspotId === "header"}
            onHotspotClick={onHotspotClick}
          >
            <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                  <LifeBuoy className="h-3.5 w-3.5 text-alloro-orange" />
                  Support
                </p>
                <h1 className="font-display text-[28px] font-normal leading-tight tracking-tight text-alloro-navy">
                  Help desk
                </h1>
                <p className="mt-1.5 max-w-[560px] text-[13px] font-normal leading-relaxed text-slate-500">
                  Submit a ticket, follow status, and keep the full support
                  conversation in one place.
                </p>
              </div>

              {/* ── new-ticket-btn ──────────────────────────────── */}
              <HotspotZone
                id="new-ticket-btn"
                hotspot={findHotspot("new-ticket-btn")}
                isActive={activeHotspotId === "new-ticket-btn"}
                onHotspotClick={onHotspotClick}
              >
                <button
                  type="button"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-alloro-orange px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-white shadow-[0_10px_24px_rgba(214,104,83,0.24)] transition hover:brightness-105 focus:outline-none focus:ring-4 focus:ring-alloro-orange/20"
                >
                  <Plus className="h-4 w-4" />
                  New ticket
                </button>
              </HotspotZone>
            </header>
          </HotspotZone>

          {/* ── two-column grid ─────────────────────────────────── */}
          <main className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
            {/* ── ticket-list (SupportTicketList.tsx) ───────────── */}
            <HotspotZone
              id="ticket-list"
              hotspot={findHotspot("ticket-list")}
              isActive={activeHotspotId === "ticket-list"}
              onHotspotClick={onHotspotClick}
            >
              <section className="h-fit rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03),0_1px_3px_rgba(0,0,0,0.05)] lg:sticky lg:top-6">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                      Support
                    </p>
                    <h2 className="font-display text-[21px] font-normal leading-tight text-alloro-navy">
                      Tickets
                    </h2>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-500">
                      {tickets.length}
                    </span>
                    <button
                      type="button"
                      aria-label="Create support ticket"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-alloro-orange text-white shadow-[0_8px_18px_rgba(214,104,83,0.22)] transition hover:brightness-105 focus:outline-none focus:ring-4 focus:ring-alloro-orange/20"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="max-h-[calc(100vh-230px)] space-y-2.5 overflow-y-auto pr-1">
                  {tickets.map((ticket) => {
                    const typeMeta = ticketTypeMeta[ticket.type];
                    const isSelected = ticket.id === selectedTicket.id;
                    return (
                      <button
                        key={ticket.id}
                        type="button"
                        className={`w-full rounded-xl border p-3 text-left transition hover:border-alloro-orange/60 focus:outline-none focus:ring-4 focus:ring-alloro-orange/15 ${
                          isSelected
                            ? "border-alloro-orange bg-alloro-orange/5"
                            : "border-slate-200 bg-white"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                              {ticket.publicId} - {typeMeta.label}
                            </p>
                            <h3 className="mt-1 line-clamp-2 text-[14px] font-semibold leading-snug text-alloro-navy">
                              {ticket.title}
                            </h3>
                          </div>
                          <StatusBadge status={ticket.status} />
                        </div>
                        <p className="mt-2 text-xs font-medium text-slate-400">
                          Updated {ticket.updatedAt}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </section>
            </HotspotZone>

            {/* ── ticket-detail (SupportTicketDetail.tsx) ────────── */}
            <HotspotZone
              id="ticket-detail"
              hotspot={findHotspot("ticket-detail")}
              isActive={activeHotspotId === "ticket-detail"}
              onHotspotClick={onHotspotClick}
            >
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03),0_1px_3px_rgba(0,0,0,0.05)] sm:p-6">
                {/* detail header */}
                <div className="mb-5 flex flex-col gap-4 border-b border-slate-100 pb-5 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                      {selectedTicket.publicId} - {selectedType.label}
                    </p>
                    <h2 className="mt-1 font-display text-[24px] font-normal leading-tight tracking-tight text-alloro-navy">
                      {selectedTicket.title}
                    </h2>
                  </div>
                  <StatusBadge status={selectedTicket.status} />
                </div>

                {/* attachments section (SupportTicketAttachments.tsx) */}
                <section className="mb-5 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
                  <div className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                    <Paperclip className="h-3.5 w-3.5 text-alloro-orange" />
                    Attachments
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <article className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <FileText className="h-4 w-4 shrink-0 text-alloro-orange" />
                        <div className="min-w-0">
                          <p className="truncate text-[12px] font-semibold text-alloro-navy">
                            error-screenshot.png
                          </p>
                          <p className="text-[11px] font-medium text-slate-400">
                            245.3 KB
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        aria-label="Download error-screenshot.png"
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:border-alloro-orange/50 hover:text-alloro-navy focus:outline-none focus:ring-4 focus:ring-alloro-orange/15 cursor-default"
                      >
                        <Download className="h-4 w-4" />
                      </button>
                    </article>
                  </div>
                </section>

                {/* message thread (SupportMessageThread.tsx) */}
                <div className="space-y-3">
                  {messages.map((message) => {
                    const isClient = message.authorRole === "client";
                    return (
                      <article
                        key={message.id}
                        className={`rounded-xl border p-3.5 ${
                          isClient
                            ? "border-slate-200 bg-white"
                            : "border-alloro-orange/20 bg-alloro-orange/5"
                        }`}
                      >
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                            {isClient ? "You" : message.authorName}
                          </p>
                          <time className="text-xs font-medium text-slate-400">
                            {message.createdAt}
                          </time>
                        </div>
                        <p className="whitespace-pre-wrap text-[13px] font-medium leading-relaxed text-alloro-navy">
                          {message.body}
                        </p>
                      </article>
                    );
                  })}
                </div>

                {/* reply area */}
                <div className="mt-5 space-y-3">
                  <label className="sr-only" htmlFor="support-reply">
                    Reply to support
                  </label>
                  <textarea
                    id="support-reply"
                    rows={4}
                    readOnly
                    placeholder="Add a reply or new detail for the support team."
                    className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-[13px] font-medium text-alloro-navy placeholder:text-slate-400 focus:border-alloro-orange focus:outline-none focus:ring-4 focus:ring-alloro-orange/15"
                  />
                  <button
                    type="button"
                    className="rounded-xl bg-alloro-navy px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-white transition hover:brightness-110 focus:outline-none focus:ring-4 focus:ring-alloro-teal/25 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Reply
                  </button>
                </div>
              </section>
            </HotspotZone>
          </main>
        </div>
      </div>
    </DashboardLayout>
  );
}
