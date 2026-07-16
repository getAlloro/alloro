import type {
  FinalStage,
  LinkedVia,
  SubmissionSummary,
} from "../../../types/leadgen";

export type StageTone = "green" | "blue" | "red" | "amber" | "gray";

export type StageDisplay = {
  label: string;
  tone: StageTone;
};

export const STAGE_TONE: Record<FinalStage, StageTone> = {
  results_viewed: "green",
  report_engaged_1min: "green",
  account_created: "green",
  account_linked: "green",
  email_submitted: "blue",
  abandoned: "red",
  input_submitted: "amber",
  audit_started: "amber",
  stage_viewed_1: "amber",
  stage_viewed_2: "amber",
  stage_viewed_3: "amber",
  stage_viewed_4: "amber",
  stage_viewed_5: "amber",
  email_gate_shown: "amber",
  landed: "gray",
  input_started: "gray",
};

export const STAGE_CLASSES: Record<StageTone, string> = {
  green: "bg-green-100 text-green-700",
  blue: "bg-blue-100 text-blue-700",
  red: "bg-red-100 text-red-700",
  amber: "bg-amber-100 text-amber-700",
  gray: "bg-gray-100 text-gray-600",
};

export const STAGE_LABEL: Record<FinalStage, string> = {
  landed: "Landed on Page",
  input_started: "Started Typing Search",
  input_submitted: "Submitted Search",
  audit_started: "Audit Started",
  stage_viewed_1: "Website Scan Viewed",
  stage_viewed_2: "GBP Analysis Viewed",
  stage_viewed_3: "Photos Sub-stage (legacy)",
  stage_viewed_4: "Competitor Map Viewed",
  stage_viewed_5: "Report Viewed",
  results_viewed: "More Results Viewed",
  report_engaged_1min: "Report Visible for 1+ Min",
  email_gate_shown: "Email Gate Shown",
  email_submitted: "Email Submitted",
  account_created: "Account Linked",
  account_linked: "Account Linked",
  abandoned: "Abandoned",
};

export function getStageDisplay(submission: SubmissionSummary): StageDisplay {
  if (submission.data_quality === "report_without_audit") {
    return { label: "Unverified report activity", tone: "red" };
  }
  if (submission.data_quality === "empty") {
    return { label: "Empty session", tone: "gray" };
  }

  return {
    label: STAGE_LABEL[submission.final_stage] ?? submission.final_stage,
    tone: STAGE_TONE[submission.final_stage] ?? "gray",
  };
}

export function getAssociationLabel(
  linkedVia: LinkedVia | undefined,
): string | null {
  if (linkedVia === "email") return "Existing account email match";
  if (linkedVia === "domain") return "Known organization match";
  return null;
}

export function hasPersistedAccountLink(
  submission: SubmissionSummary,
): boolean {
  return submission.user_id != null || submission.converted_at != null;
}

export function isPersistedConversion(submission: SubmissionSummary): boolean {
  return submission.converted_at != null;
}

export function getAuditStatusDisplay(
  status: string | null,
): StageDisplay | null {
  if (!status) return null;
  const normalized = status.toLowerCase();
  if (normalized === "completed" || normalized === "complete") {
    return { label: status, tone: "green" };
  }
  if (normalized === "failed" || normalized === "error") {
    return { label: status, tone: "red" };
  }
  if (normalized === "processing" || normalized === "pending") {
    return { label: status, tone: "amber" };
  }
  return { label: status, tone: "gray" };
}

export function friendlyUserAgent(
  userAgent: string | null | undefined,
): string | null {
  if (!userAgent) return null;
  const normalized = userAgent.toLowerCase();
  let browser = "Browser";
  if (normalized.includes("edg/") || normalized.includes("edge/"))
    browser = "Edge";
  else if (normalized.includes("chrome/") && !normalized.includes("chromium/"))
    browser = "Chrome";
  else if (normalized.includes("firefox/")) browser = "Firefox";
  else if (normalized.includes("safari/") && !normalized.includes("chrome/"))
    browser = "Safari";
  else if (normalized.includes("opera/") || normalized.includes("opr/"))
    browser = "Opera";

  let os = "Device";
  if (
    normalized.includes("iphone") ||
    normalized.includes("ipad") ||
    normalized.includes("ios")
  )
    os = "iOS";
  else if (normalized.includes("android")) os = "Android";
  else if (normalized.includes("mac os") || normalized.includes("macintosh"))
    os = "macOS";
  else if (normalized.includes("windows")) os = "Windows";
  else if (normalized.includes("linux")) os = "Linux";

  return `${browser} · ${os}`;
}

export function shortSessionId(id: string): string {
  return id.slice(0, 8);
}

export function formatSubmissionDate(iso: string): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const hasCurrentYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleString(undefined, {
    ...(hasCurrentYear ? {} : { year: "numeric" }),
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
