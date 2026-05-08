import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { QUERY_KEYS } from "../../lib/queryClient";
import {
  createAdminSupportMessage,
  createSupportTicket,
  createSupportTicketMessage,
  fetchAdminSupportTicketAttachmentUrl,
  fetchSupportTicket,
  fetchSupportTicketAttachmentUrl,
  fetchAdminSupportAssignees,
  fetchAdminSupportTicket,
  fetchAdminSupportTickets,
  fetchSupportTickets,
  updateAdminSupportTicket,
  uploadSupportTicketAttachment,
} from "../../api/support";
import type {
  AdminSupportTicketFilters,
  AdminSupportTicketUpdatePayload,
  CreateSupportTicketPayload,
  SupportMessageVisibility,
  SupportTicketDetailResponse,
  SupportTicketFilters,
  SupportTicketListResponse,
} from "../../api/support";

export function useSupportTickets(filters: SupportTicketFilters = {}) {
  return useQuery<SupportTicketListResponse>({
    queryKey: QUERY_KEYS.supportTickets(filters),
    queryFn: () => fetchSupportTickets(filters),
    staleTime: 15_000,
  });
}

export function useSupportTicket(ticketId: string | null) {
  return useQuery<SupportTicketDetailResponse>({
    queryKey: QUERY_KEYS.supportTicket(ticketId),
    queryFn: () => fetchSupportTicket(ticketId!),
    enabled: !!ticketId,
    staleTime: 10_000,
  });
}

export function useCreateSupportTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      payload,
      files = [],
    }: {
      payload: CreateSupportTicketPayload;
      files?: File[];
    }) => {
      const created = await createSupportTicket(payload);
      if (files.length === 0) return created;

      await Promise.all(
        files.map((file) => uploadSupportTicketAttachment(created.ticket.id, file)),
      );
      return fetchSupportTicket(created.ticket.id);
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.supportTicketsAll });
      qc.setQueryData(QUERY_KEYS.supportTicket(data.ticket.id), data);
    },
  });
}

export function useSupportAttachmentUrl(isAdmin = false) {
  return useMutation({
    mutationFn: ({
      ticketId,
      attachmentId,
      download = false,
    }: {
      ticketId: string;
      attachmentId: string;
      download?: boolean;
    }) =>
      isAdmin
        ? fetchAdminSupportTicketAttachmentUrl(ticketId, attachmentId, download)
        : fetchSupportTicketAttachmentUrl(ticketId, attachmentId, download),
  });
}

export function useCreateSupportTicketMessage(ticketId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => createSupportTicketMessage(ticketId!, body),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.supportTicketsAll });
      qc.setQueryData(QUERY_KEYS.supportTicket(data.ticket.id), data);
    },
  });
}

export function useAdminSupportTickets(
  filters: AdminSupportTicketFilters = {},
) {
  return useQuery<SupportTicketListResponse>({
    queryKey: QUERY_KEYS.adminSupportTickets(filters),
    queryFn: () => fetchAdminSupportTickets(filters),
    staleTime: 10_000,
    refetchInterval: 30_000,
  });
}

export function useAdminSupportTicket(ticketId: string | null) {
  return useQuery<SupportTicketDetailResponse>({
    queryKey: QUERY_KEYS.adminSupportTicket(ticketId),
    queryFn: () => fetchAdminSupportTicket(ticketId!),
    enabled: !!ticketId,
    staleTime: 5_000,
  });
}

export function useAdminSupportAssignees() {
  return useQuery({
    queryKey: QUERY_KEYS.adminSupportAssignees,
    queryFn: fetchAdminSupportAssignees,
    staleTime: 60_000,
  });
}

export function useUpdateAdminSupportTicket(ticketId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: AdminSupportTicketUpdatePayload) =>
      updateAdminSupportTicket(ticketId!, payload),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.adminSupportTicketsAll });
      qc.setQueryData(QUERY_KEYS.adminSupportTicket(data.ticket.id), data);
    },
  });
}

export function useCreateAdminSupportMessage(ticketId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      body: string;
      visibility: SupportMessageVisibility;
    }) =>
      createAdminSupportMessage(ticketId!, payload.body, payload.visibility),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.adminSupportTicketsAll });
      qc.setQueryData(QUERY_KEYS.adminSupportTicket(data.ticket.id), data);
    },
  });
}
