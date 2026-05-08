import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import type { SupportTicket } from "../../api/support";
import { AdminSupportFilters } from "../../components/Admin/support/AdminSupportFilters";
import type { AdminSupportFiltersValue } from "../../components/Admin/support/AdminSupportFilters";
import { AdminSupportQueue } from "../../components/Admin/support/AdminSupportQueue";
import type { AdminSupportGroup } from "../../components/Admin/support/AdminSupportQueue";
import { AdminSupportTicketPanel } from "../../components/Admin/support/AdminSupportTicketPanel";
import { useAdminOrganizations } from "../../hooks/queries/useAdminQueries";
import {
  useAdminSupportAssignees,
  useAdminSupportTicket,
  useAdminSupportTickets,
  useCreateAdminSupportMessage,
  useUpdateAdminSupportTicket,
} from "../../hooks/queries/useSupportQueries";

const defaultFilters: AdminSupportFiltersValue = {
  q: "",
  status: "open",
  type: "",
  organizationId: "",
};

export default function SupportDashboard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [filters, setFilters] =
    useState<AdminSupportFiltersValue>(defaultFilters);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(
    searchParams.get("ticket"),
  );

  const listQuery = useAdminSupportTickets({
    limit: 100,
    q: filters.q || undefined,
    status: filters.status || undefined,
    type: filters.type || undefined,
    organizationId: filters.organizationId || undefined,
  });
  const detailQuery = useAdminSupportTicket(selectedTicketId);
  const updateTicket = useUpdateAdminSupportTicket(selectedTicketId);
  const createMessage = useCreateAdminSupportMessage(selectedTicketId);
  const organizationsQuery = useAdminOrganizations();
  const assigneesQuery = useAdminSupportAssignees();

  const tickets = useMemo(
    () => listQuery.data?.tickets || [],
    [listQuery.data?.tickets],
  );
  const groups = useMemo(() => groupTicketsByClient(tickets), [tickets]);

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

  return (
    <div className="pm-light min-h-[calc(100vh-104px)] bg-[var(--color-pm-bg-primary)] font-body text-alloro-navy">
      <div className="mx-auto w-full max-w-[1320px] space-y-5 px-4 py-6 sm:px-6 lg:px-8">
        <AdminSupportFilters
          value={filters}
          organizations={organizationsQuery.data || []}
          onChange={setFilters}
        />

        <motion.main
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.05, ease: "easeOut" }}
          className="grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]"
        >
          <AdminSupportQueue
            groups={groups}
            selectedTicketId={selectedTicketId}
            isLoading={listQuery.isLoading}
            onSelectTicket={handleSelectTicket}
          />
          <AdminSupportTicketPanel
            ticket={detailQuery.data?.ticket}
            messages={detailQuery.data?.messages}
            attachments={detailQuery.data?.attachments}
            isLoading={detailQuery.isLoading}
            isUpdating={updateTicket.isPending}
            isMessaging={createMessage.isPending}
            assignees={assigneesQuery.data || []}
            onUpdate={(payload) =>
              updateTicket.mutate(payload, {
                onSuccess: () => toast.success("Ticket updated"),
                onError: (error) => toast.error(error.message),
              })
            }
            onMessage={(body, visibility) =>
              createMessage.mutate(
                { body, visibility },
                {
                  onSuccess: () => toast.success("Message sent"),
                  onError: (error) => toast.error(error.message),
                },
              )
            }
          />
        </motion.main>
      </div>
    </div>
  );
}

function groupTicketsByClient(tickets: SupportTicket[]): AdminSupportGroup[] {
  const grouped = tickets.reduce<Record<string, SupportTicket[]>>(
    (acc, ticket) => {
      const key =
        ticket.organizationName || `Organization ${ticket.organizationId}`;
      acc[key] = [...(acc[key] || []), ticket];
      return acc;
    },
    {},
  );

  return Object.entries(grouped).map(([organizationName, groupTickets]) => ({
    organizationName,
    tickets: groupTickets,
  }));
}
