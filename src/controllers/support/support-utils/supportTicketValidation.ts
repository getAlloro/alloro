import {
  SupportTicketPriority,
  SupportTicketSeverity,
  SupportTicketStatus,
  SupportTicketType,
} from "../../../models/SupportTicketModel";

export interface ValidationResult<T> {
  valid: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface CreateSupportTicketData {
  type: SupportTicketType;
  guidedAnswers: Record<string, unknown>;
  additionalContext?: string;
  currentPageUrl?: string;
  requestedCompletionDate?: string;
  locationId?: number | null;
}

export interface CreateSupportMessageData {
  body: string;
}

export interface AdminSupportTicketUpdateData {
  status?: SupportTicketStatus;
  severity?: SupportTicketSeverity;
  priority?: SupportTicketPriority;
  assignedToUserId?: number | null;
  targetSprint?: string | null;
  internalNotes?: string | null;
  resolutionNotes?: string | null;
}

export interface AdminSupportMessageData extends CreateSupportMessageData {
  visibility: "client_visible" | "internal";
}

const TICKET_TYPES: SupportTicketType[] = [
  "bug_report",
  "feature_request",
  "website_edit",
];

const STATUSES: SupportTicketStatus[] = [
  "new",
  "triaged",
  "in_progress",
  "waiting_on_client",
  "resolved",
  "wont_fix",
  "archived",
];

const SEVERITIES: SupportTicketSeverity[] = ["low", "medium", "high"];
const PRIORITIES: SupportTicketPriority[] = ["p0", "p1", "p2", "p3"];

export function validateCreateSupportTicketInput(
  body: Record<string, unknown>,
): ValidationResult<CreateSupportTicketData> {
  const type = body.type as SupportTicketType;

  if (!TICKET_TYPES.includes(type)) {
    return failure("INVALID_TYPE", "Choose a support request type.");
  }

  const guidedAnswers =
    body.guidedAnswers && typeof body.guidedAnswers === "object"
      ? (body.guidedAnswers as Record<string, unknown>)
      : {};

  const additionalContext = cleanText(body.additionalContext, 4000);
  const currentPageUrl = cleanText(body.currentPageUrl, 2048);
  const requestedCompletionDate = cleanDate(body.requestedCompletionDate);
  const locationId = cleanOptionalNumber(body.locationId);

  const requiredError = validateGuidedAnswers(type, guidedAnswers);
  if (requiredError) {
    return failure("MISSING_DETAILS", requiredError);
  }

  if (type === "website_edit" && !requestedCompletionDate) {
    return failure(
      "MISSING_COMPLETION_DATE",
      "Choose the date you need this website edit completed.",
    );
  }

  const sanitizedGuidedAnswers = sanitizeGuidedAnswers(type, guidedAnswers);

  return {
    valid: true,
    data: {
      type,
      guidedAnswers: sanitizedGuidedAnswers,
      additionalContext,
      currentPageUrl,
      requestedCompletionDate,
      locationId,
    },
  };
}

export function validateCreateSupportMessageInput(
  body: Record<string, unknown>,
): ValidationResult<CreateSupportMessageData> {
  const bodyText = cleanText(body.body, 4000);
  if (!bodyText) {
    return failure("MISSING_MESSAGE", "Add a response before sending.");
  }

  return {
    valid: true,
    data: { body: bodyText },
  };
}

export function validateAdminSupportTicketUpdateInput(
  body: Record<string, unknown>,
): ValidationResult<AdminSupportTicketUpdateData> {
  const data: AdminSupportTicketUpdateData = {};

  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status as SupportTicketStatus)) {
      return failure("INVALID_STATUS", "Choose a valid ticket status.");
    }
    data.status = body.status as SupportTicketStatus;
  }

  if (body.severity !== undefined) {
    if (!SEVERITIES.includes(body.severity as SupportTicketSeverity)) {
      return failure("INVALID_SEVERITY", "Choose a valid severity.");
    }
    data.severity = body.severity as SupportTicketSeverity;
  }

  if (body.priority !== undefined) {
    if (!PRIORITIES.includes(body.priority as SupportTicketPriority)) {
      return failure("INVALID_PRIORITY", "Choose a valid priority.");
    }
    data.priority = body.priority as SupportTicketPriority;
  }

  if (body.targetSprint !== undefined) {
    data.targetSprint = cleanNullableText(body.targetSprint, 120);
  }
  if (body.internalNotes !== undefined) {
    data.internalNotes = cleanNullableText(body.internalNotes, 8000);
  }
  if (body.resolutionNotes !== undefined) {
    data.resolutionNotes = cleanNullableText(body.resolutionNotes, 8000);
  }

  if (body.assignedToUserId !== undefined) {
    data.assignedToUserId = cleanOptionalNumber(body.assignedToUserId);
  }

  return { valid: true, data };
}

export function validateAdminSupportMessageInput(
  body: Record<string, unknown>,
): ValidationResult<AdminSupportMessageData> {
  const messageValidation = validateCreateSupportMessageInput(body);
  if (!messageValidation.valid || !messageValidation.data) {
    return messageValidation as ValidationResult<AdminSupportMessageData>;
  }

  const visibility =
    body.visibility === "internal" ? "internal" : "client_visible";

  return {
    valid: true,
    data: {
      body: messageValidation.data.body,
      visibility,
    },
  };
}

function validateGuidedAnswers(
  type: SupportTicketType,
  guidedAnswers: Record<string, unknown>,
): string | null {
  if (type === "bug_report") {
    if (!cleanText(guidedAnswers.tryingToDo, 255)) {
      return "Tell us what you were trying to do.";
    }
    if (!cleanText(guidedAnswers.whatHappened, 2000)) {
      return "Tell us what happened instead.";
    }
    if (!cleanText(guidedAnswers.workImpact, 1000)) {
      return "Tell us how this is affecting your work.";
    }
  }

  if (type === "feature_request") {
    if (!cleanText(guidedAnswers.idea, 255)) {
      return "Add the feature idea you want us to evaluate.";
    }
    if (!cleanText(guidedAnswers.usefulness, 2000)) {
      return "Tell us how this would help your practice use Alloro.";
    }
  }

  if (type === "website_edit") {
    if (!cleanText(guidedAnswers.pageUrl, 2048)) {
      return "Add the website page URL that needs an edit.";
    }
    if (!cleanText(guidedAnswers.requestedChange, 2000)) {
      return "Describe the website change you want made.";
    }
  }

  return null;
}

function sanitizeGuidedAnswers(
  type: SupportTicketType,
  guidedAnswers: Record<string, unknown>,
): Record<string, unknown> {
  if (type !== "website_edit") return guidedAnswers;

  const sanitized = { ...guidedAnswers };
  delete sanitized.approvalNotes;
  return sanitized;
}

function failure<T>(error: string, message: string): ValidationResult<T> {
  return {
    valid: false,
    error,
    message,
  };
}

function cleanText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, maxLength);
}

function cleanNullableText(value: unknown, maxLength: number): string | null {
  return cleanText(value, maxLength) || null;
}

function cleanOptionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function cleanDate(value: unknown): string | undefined {
  const text = cleanText(value, 32);
  if (!text) return undefined;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? undefined : text;
}
