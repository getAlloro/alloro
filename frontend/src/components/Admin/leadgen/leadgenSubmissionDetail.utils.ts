/**
 * Pure helpers + constants for LeadgenSubmissionDetail.
 *
 * No React, no hooks — moved verbatim out of LeadgenSubmissionDetail.tsx so
 * the drawer component stays under the file-size budget. Behavior unchanged.
 */

import {
  Mail,
  CheckCircle2,
  AlertOctagon,
  MousePointerClick,
  Eye,
  ShieldQuestion,
  Rocket,
  UserPlus,
  Calendar,
  AlertCircle,
  MousePointer,
  FileText,
} from "lucide-react";
import type {
  LeadgenEventName,
  SubmissionDetail,
} from "../../../types/leadgen";
import { STAGE_LABEL } from "./LeadgenSubmissionsTable";

export const EVENT_ICONS: Partial<Record<LeadgenEventName, typeof Mail>> = {
  landed: MousePointerClick,
  input_started: MousePointerClick,
  input_submitted: FileText,
  audit_started: Rocket,
  stage_viewed_1: Eye,
  stage_viewed_2: Eye,
  stage_viewed_3: Eye,
  stage_viewed_4: Eye,
  stage_viewed_5: Eye,
  email_gate_shown: ShieldQuestion,
  email_submitted: Mail,
  results_viewed: CheckCircle2,
  account_created: UserPlus,
  account_linked: UserPlus,
  abandoned: AlertOctagon,
  // CTA / interaction events — do not advance final_stage, enrich timeline only.
  cta_clicked_strategy_call: Calendar,
  cta_clicked_create_account: UserPlus,
  email_field_focused: MousePointer,
  email_field_blurred_empty: AlertCircle,
};

/**
 * Human label map for events that are NOT in `STAGE_LABEL` (i.e. CTA /
 * interaction events). For real funnel stages we fall back to `STAGE_LABEL`.
 */
const CTA_EVENT_LABEL: Record<string, string> = {
  cta_clicked_strategy_call: "Clicked 'Book Strategy Call'",
  cta_clicked_create_account: "Clicked 'Create Account'",
  email_field_focused: "Focused email field",
  email_field_blurred_empty: "Left email field empty",
};

export function eventLabel(name: LeadgenEventName): string {
  return (
    (STAGE_LABEL as Record<string, string>)[name] ??
    CTA_EVENT_LABEL[name] ??
    name
  );
}

export function formatAbsolute(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

/**
 * Time-only variant used by individual timeline rows. The date is
 * printed once at the top of the timeline (see TimelineDateHeader) so
 * we don't repeat "Apr 16, 2026" on every single row.
 */
export function formatTimeOnly(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

/**
 * Date-only (no time) — used for the single header above the timeline
 * so the per-event rows don't have to repeat the date.
 */
export function formatDateOnly(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

/**
 * Compact duration label for the "time gap" pill that sits on the
 * connector between two consecutive events.
 *   < 1s   -> "<1s"
 *   < 1m   -> "Ns"
 *   < 1h   -> "Xm Ys"  (Ys dropped when 0)
 *   else   -> "Xh Ym"  (Ym dropped when 0)
 */
export function formatGapShort(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "";
  const sec = Math.floor(ms / 1000);
  if (sec < 1) return "<1s";
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const remSec = sec % 60;
  if (min < 60) return remSec > 0 ? `${min}m ${remSec}s` : `${min}m`;
  const hr = Math.floor(min / 60);
  const remMin = min % 60;
  return remMin > 0 ? `${hr}h ${remMin}m` : `${hr}h`;
}

/**
 * Prefer the parsed browser/os/device_type triple (populated by the tracking
 * controller from `user-agent` on ingest) over the raw user-agent string.
 * Falls back to the raw UA when parsed fields are missing (legacy rows).
 */
export function friendlyDeviceLabel(s: SubmissionDetail["session"]): string {
  const parts: string[] = [];
  if (s.browser) parts.push(s.browser);
  if (s.os) parts.push(s.os);
  if (s.device_type) parts.push(s.device_type);
  if (parts.length > 0) return parts.join(" · ");
  return s.user_agent ?? "—";
}

export type JsonToken = { text: string; cls: string | null };

/**
 * Tokenize a JSON.stringify output into colored spans without resorting
 * to dangerouslySetInnerHTML. Uses `String.matchAll` so whitespace,
 * braces, brackets, and commas survive verbatim between matches.
 */
export function tokenizeJson(obj: unknown): JsonToken[] {
  let text: string;
  try {
    text = JSON.stringify(obj, null, 2) ?? "null";
  } catch {
    text = String(obj);
  }
  const re =
    /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(?:\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;
  const out: JsonToken[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push({ text: text.slice(last, idx), cls: null });
    const match = m[0];
    let cls = "text-orange-300";
    if (/^"/.test(match)) {
      cls = /:\s*$/.test(match) ? "text-sky-300" : "text-emerald-300";
    } else if (match === "true" || match === "false") {
      cls = "text-purple-300";
    } else if (match === "null") {
      cls = "text-slate-500";
    }
    out.push({ text: match, cls });
    last = idx + match.length;
  }
  if (last < text.length) out.push({ text: text.slice(last), cls: null });
  return out;
}
