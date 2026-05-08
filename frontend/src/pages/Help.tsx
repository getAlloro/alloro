import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { LifeBuoy, Plus } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import type { CreateSupportTicketPayload } from "../api/support";
import { SupportTicketComposerModal } from "../components/support/SupportTicketComposerModal";
import { SupportTicketDetail } from "../components/support/SupportTicketDetail";
import { SupportTicketList } from "../components/support/SupportTicketList";
import { useLocationContext } from "../contexts/locationContext";
import {
  useCreateSupportTicket,
  useCreateSupportTicketMessage,
  useSupportTicket,
  useSupportTickets,
} from "../hooks/queries/useSupportQueries";

export default function Help() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [composerError, setComposerError] = useState<string | null>(null);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(
    searchParams.get("ticket"),
  );
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const { selectedLocation } = useLocationContext();
  const ticketsQuery = useSupportTickets({ limit: 50 });
  const detailQuery = useSupportTicket(selectedTicketId);
  const createTicket = useCreateSupportTicket();
  const createMessage = useCreateSupportTicketMessage(selectedTicketId);

  const tickets = useMemo(
    () => ticketsQuery.data?.tickets || [],
    [ticketsQuery.data?.tickets],
  );

  useEffect(() => {
    const ticketFromUrl = searchParams.get("ticket");
    if (ticketFromUrl && ticketFromUrl !== selectedTicketId) {
      setSelectedTicketId(ticketFromUrl);
    }
  }, [searchParams, selectedTicketId]);

  useEffect(() => {
    if (!selectedTicketId && tickets.length > 0) {
      setSelectedTicketId(tickets[0].id);
    }
  }, [selectedTicketId, tickets]);

  const handleSelectTicket = (ticketId: string) => {
    setSelectedTicketId(ticketId);
    setSearchParams({ ticket: ticketId });
  };

  const handleOpenComposer = () => {
    setComposerError(null);
    setIsComposerOpen(true);
  };

  const handleCloseComposer = () => {
    if (!createTicket.isPending) {
      setIsComposerOpen(false);
    }
  };

  const handleSubmitTicket = (
    payload: CreateSupportTicketPayload,
    files: File[],
  ) => {
    setComposerError(null);
    createTicket.mutate({ payload, files }, {
      onSuccess: (data) => {
        toast.success("Support ticket created");
        handleSelectTicket(data.ticket.id);
        setIsComposerOpen(false);
      },
      onError: (error) => {
        setComposerError(error.message);
      },
    });
  };

  const handleReply = (body: string) => {
    createMessage.mutate(body, {
      onSuccess: () => toast.success("Reply sent"),
      onError: (error) => toast.error(error.message),
    });
  };

  return (
    <div className="pm-light min-h-screen bg-[var(--color-pm-bg-primary)] font-body text-alloro-navy">
      <div className="mx-auto w-full max-w-[1320px] space-y-6 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        <motion.header
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
        >
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
          <button
            type="button"
            onClick={handleOpenComposer}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-alloro-orange px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-white shadow-[0_10px_24px_rgba(214,104,83,0.24)] transition hover:brightness-105 focus:outline-none focus:ring-4 focus:ring-alloro-orange/20"
          >
            <Plus className="h-4 w-4" />
            New ticket
          </button>
        </motion.header>

        <motion.main
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.05, ease: "easeOut" }}
          className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]"
        >
          <SupportTicketList
            tickets={tickets}
            selectedTicketId={selectedTicketId}
            isLoading={ticketsQuery.isLoading}
            onCreateTicket={handleOpenComposer}
            onSelectTicket={handleSelectTicket}
          />
          <SupportTicketDetail
            ticket={detailQuery.data?.ticket}
            messages={detailQuery.data?.messages}
            attachments={detailQuery.data?.attachments}
            isLoading={detailQuery.isLoading}
            isReplying={createMessage.isPending}
            onReply={handleReply}
          />
        </motion.main>
      </div>

      <SupportTicketComposerModal
        isOpen={isComposerOpen}
        locationId={selectedLocation?.id ?? null}
        isSubmitting={createTicket.isPending}
        errorMessage={composerError}
        onClose={handleCloseComposer}
        onCreateTicket={handleSubmitTicket}
      />
    </div>
  );
}
