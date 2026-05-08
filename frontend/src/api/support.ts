import { apiGet, apiPatch, apiPost } from "./index";

export type SupportTicketType =
  | "bug_report"
  | "feature_request"
  | "website_edit";

export type SupportTicketStatus =
  | "new"
  | "triaged"
  | "in_progress"
  | "waiting_on_client"
  | "resolved"
  | "wont_fix"
  | "archived";

export type SupportTicketSeverity = "low" | "medium" | "high";
export type SupportTicketPriority = "p0" | "p1" | "p2" | "p3";
export type SupportMessageVisibility = "client_visible" | "internal";

export type SupportTicket = {
  id: string;
  publicId: string;
  organizationId?: number;
  organizationName?: string | null;
  locationId: number | null;
  createdByUserId?: number | null;
  createdByName?: string | null;
  createdByEmail?: string | null;
  assignedToUserId?: number | null;
  assignedToName?: string | null;
  assignedToEmail?: string | null;
  type: SupportTicketType;
  status: SupportTicketStatus;
  severity?: SupportTicketSeverity | null;
  priority?: SupportTicketPriority | null;
  targetSprint?: string | null;
  title: string;
  currentPageUrl: string | null;
  requestedCompletionDate: string | null;
  guidedAnswers: Record<string, unknown>;
  internalNotes?: string | null;
  resolutionNotes: string | null;
  ackEmailSentAt?: string | null;
  resolvedEmailSentAt?: string | null;
  resolvedAt: string | null;
  latestMessageAt?: string | null;
  clientVisibleMessageCount?: number;
  createdAt: string;
  updatedAt: string;
};

export type SupportTicketMessage = {
  id: string;
  ticketId: string;
  authorUserId: number | null;
  authorRole: "client" | "admin" | "system";
  visibility: SupportMessageVisibility;
  body: string;
  authorName?: string | null;
  authorEmail?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SupportTicketAttachment = {
  id: string;
  ticketId: string;
  uploadedByUserId?: number | null;
  uploaderRole: "client" | "admin" | "system";
  visibility: SupportMessageVisibility;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  uploadedByName?: string | null;
  uploadedByEmail?: string | null;
  createdAt: string;
};

export type SupportPagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type SupportTicketListResponse = {
  tickets: SupportTicket[];
  pagination: SupportPagination;
};

export type SupportTicketDetailResponse = {
  ticket: SupportTicket;
  messages: SupportTicketMessage[];
  attachments: SupportTicketAttachment[];
};

export type CreateSupportTicketPayload = {
  type: SupportTicketType;
  guidedAnswers: Record<string, unknown>;
  additionalContext?: string;
  currentPageUrl?: string;
  requestedCompletionDate?: string;
  locationId?: number | null;
};

export type SupportTicketFilters = {
  page?: number;
  limit?: number;
  status?: SupportTicketStatus | "open";
  type?: SupportTicketType;
};

export type AdminSupportTicketFilters = SupportTicketFilters & {
  organizationId?: number;
  assignedToUserId?: number | "unassigned";
  q?: string;
};

export type AdminSupportTicketUpdatePayload = {
  status?: SupportTicketStatus;
  severity?: SupportTicketSeverity;
  priority?: SupportTicketPriority;
  assignedToUserId?: number | null;
  targetSprint?: string | null;
  internalNotes?: string | null;
  resolutionNotes?: string | null;
};

export type AdminSupportAssignee = {
  id: number;
  email: string;
  displayName: string;
};

export type SupportAttachmentUrlResponse = {
  url: string;
  expiresInSeconds: number;
};

type ApiEnvelope<T> = {
  success: boolean;
  data: T | null;
  error: { code: string; message: string; details?: unknown } | null;
};

export async function fetchSupportTickets(
  filters: SupportTicketFilters = {},
): Promise<SupportTicketListResponse> {
  return unwrap(await apiGet({ path: `/support/tickets${toQuery(filters)}` }));
}

export async function fetchSupportTicket(
  ticketId: string,
): Promise<SupportTicketDetailResponse> {
  return unwrap(await apiGet({ path: `/support/tickets/${ticketId}` }));
}

export async function createSupportTicket(
  payload: CreateSupportTicketPayload,
): Promise<SupportTicketDetailResponse> {
  return unwrap(
    await apiPost({ path: "/support/tickets", passedData: payload }),
  );
}

export async function uploadSupportTicketAttachment(
  ticketId: string,
  file: File,
): Promise<SupportTicketAttachment> {
  const formData = new FormData();
  formData.append("file", file);
  const data = unwrap<{ attachment: SupportTicketAttachment }>(
    await apiPost({
      path: `/support/tickets/${ticketId}/attachments`,
      passedData: formData,
    }),
  );
  return data.attachment;
}

export async function fetchSupportTicketAttachmentUrl(
  ticketId: string,
  attachmentId: string,
  download = false,
): Promise<SupportAttachmentUrlResponse> {
  return unwrap(
    await apiGet({
      path: `/support/tickets/${ticketId}/attachments/${attachmentId}/url${
        download ? "?download=1" : ""
      }`,
    }),
  );
}

export async function createSupportTicketMessage(
  ticketId: string,
  body: string,
): Promise<SupportTicketDetailResponse> {
  return unwrap(
    await apiPost({
      path: `/support/tickets/${ticketId}/messages`,
      passedData: { body },
    }),
  );
}

export async function fetchAdminSupportTickets(
  filters: AdminSupportTicketFilters = {},
): Promise<SupportTicketListResponse> {
  return unwrap(
    await apiGet({ path: `/admin/support/tickets${toQuery(filters)}` }),
  );
}

export async function fetchAdminSupportTicket(
  ticketId: string,
): Promise<SupportTicketDetailResponse> {
  return unwrap(await apiGet({ path: `/admin/support/tickets/${ticketId}` }));
}

export async function updateAdminSupportTicket(
  ticketId: string,
  payload: AdminSupportTicketUpdatePayload,
): Promise<SupportTicketDetailResponse> {
  return unwrap(
    await apiPatch({
      path: `/admin/support/tickets/${ticketId}`,
      passedData: payload,
    }),
  );
}

export async function uploadAdminSupportTicketAttachment(
  ticketId: string,
  file: File,
  visibility: SupportMessageVisibility = "client_visible",
): Promise<SupportTicketAttachment> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("visibility", visibility);
  const data = unwrap<{ attachment: SupportTicketAttachment }>(
    await apiPost({
      path: `/admin/support/tickets/${ticketId}/attachments`,
      passedData: formData,
    }),
  );
  return data.attachment;
}

export async function fetchAdminSupportTicketAttachmentUrl(
  ticketId: string,
  attachmentId: string,
  download = false,
): Promise<SupportAttachmentUrlResponse> {
  return unwrap(
    await apiGet({
      path: `/admin/support/tickets/${ticketId}/attachments/${attachmentId}/url${
        download ? "?download=1" : ""
      }`,
    }),
  );
}

export async function createAdminSupportMessage(
  ticketId: string,
  body: string,
  visibility: SupportMessageVisibility,
): Promise<SupportTicketDetailResponse> {
  return unwrap(
    await apiPost({
      path: `/admin/support/tickets/${ticketId}/messages`,
      passedData: { body, visibility },
    }),
  );
}

export async function fetchAdminSupportAssignees(): Promise<
  AdminSupportAssignee[]
> {
  const users = unwrap<
    Array<{ id: number; email: string; display_name: string }>
  >(await apiGet({ path: "/pm/users" }));

  return users.map((user) => ({
    id: user.id,
    email: user.email,
    displayName: user.display_name,
  }));
}

function toQuery(filters: Record<string, unknown>): string {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      params.append(key, String(value));
    }
  });
  const query = params.toString();
  return query ? `?${query}` : "";
}

function unwrap<T>(response: ApiEnvelope<T> | T): T {
  const envelope = response as ApiEnvelope<T>;
  if (typeof envelope.success === "boolean") {
    if (!envelope.success) {
      throw new Error(envelope.error?.message || "Support request failed");
    }
    return envelope.data as T;
  }

  return response as T;
}
