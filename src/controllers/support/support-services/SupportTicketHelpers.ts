import {
  SupportTicket,
  SupportTicketType,
} from "../../../models/SupportTicketModel";
import { UserModel } from "../../../models/UserModel";
import {
  AdminSupportTicketUpdateData,
  CreateSupportTicketData,
} from "../support-utils/supportTicketValidation";

const PUBLIC_ID_PREFIXES: Record<SupportTicketType, string> = {
  bug_report: "BUG",
  feature_request: "FEAT",
  website_edit: "WEB",
};

export function buildPublicId(
  type: SupportTicketType,
  sequence: number,
): string {
  return `${PUBLIC_ID_PREFIXES[type]}-${String(sequence).padStart(4, "0")}`;
}

export function buildTitle(
  type: SupportTicketType,
  answers: Record<string, unknown>,
): string {
  const fallback = {
    bug_report: "Bug report",
    feature_request: "Feature request",
    website_edit: "Website edit",
  }[type];
  const source =
    type === "bug_report"
      ? answers.tryingToDo || answers.summary
      : type === "feature_request"
        ? answers.idea
        : answers.requestedChange;
  return typeof source === "string" && source.trim()
    ? source.trim().slice(0, 180)
    : fallback;
}

export function buildInitialMessage(input: CreateSupportTicketData): string {
  const lines = Object.entries(input.guidedAnswers)
    .filter(
      ([, value]) => value !== null && value !== undefined && value !== "",
    )
    .map(([key, value]) => `${labelize(key)}: ${String(value)}`);

  if (input.additionalContext) {
    lines.push(`Additional context: ${input.additionalContext}`);
  }

  return lines.join("\n\n");
}

export function buildAdminUpdateData(input: AdminSupportTicketUpdateData) {
  const data: Partial<SupportTicket> = {};
  if (input.status !== undefined) {
    data.status = input.status;
    if (["resolved", "wont_fix", "archived"].includes(input.status)) {
      data.resolved_at = new Date();
    } else {
      data.resolved_at = null;
    }
  }
  if (input.severity !== undefined) data.severity = input.severity;
  if (input.priority !== undefined) data.priority = input.priority;
  if (input.assignedToUserId !== undefined) {
    data.assigned_to_user_id = input.assignedToUserId;
  }
  if (input.targetSprint !== undefined) data.target_sprint = input.targetSprint;
  if (input.internalNotes !== undefined)
    data.internal_notes = input.internalNotes;
  if (input.resolutionNotes !== undefined) {
    data.resolution_notes = input.resolutionNotes;
  }
  return data;
}

export async function resolveAssigneeId(
  type: SupportTicketType,
): Promise<number | null> {
  const emailByType: Record<SupportTicketType, string | undefined> = {
    bug_report: process.env.SUPPORT_BUG_ASSIGNEE_EMAIL,
    feature_request: process.env.SUPPORT_FEATURE_ASSIGNEE_EMAIL,
    website_edit: process.env.SUPPORT_WEB_ASSIGNEE_EMAIL,
  };

  const email = emailByType[type];
  if (!email) return null;

  const user = await UserModel.findByEmail(email);
  return user?.id || null;
}

export function displayUserName(user: {
  name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
}): string | null {
  const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ");
  return user.name || fullName || user.email || null;
}

function labelize(key: string): string {
  const labels: Record<string, string> = {
    tryingToDo: "What you were trying to do",
    whatHappened: "What happened instead",
    workImpact: "How this affects your work",
    idea: "What you would like Alloro to do",
    usefulness: "How this would help your practice use Alloro",
    importance: "How important this is right now",
    pageUrl: "Where on the site this change belongs",
    requestedChange: "What should change",
    approvalNotes: "Approval notes",
  };

  if (labels[key]) return labels[key];

  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/[_-]/g, " ")
    .replace(/^./, (char) => char.toUpperCase());
}
