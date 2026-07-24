/**
 * Owner Weekly Digest email template.
 *
 * The proactive "here is what Alloro did for you this week" recap that comes TO
 * the owner from Alloro — a report, not a dashboard they have to visit, and not
 * an outbound message to a patient. It has two honest halves:
 *   1. What Alloro DID — dated, logged facts from the proof receipt (posts
 *      published, review replies posted). Past tense.
 *   2. Where the practice STANDS — the three funnel gates
 *      (impressions → visits → leads) as measured this month, or an honest
 *      "not connected yet" when a source is missing.
 *
 * Value #6 discipline: this template renders ONLY the values it is handed. It
 * invents no "+N" change, makes no promise, and states no outcome the caller
 * did not measure. The composing service (services/owner-digest) is the only
 * place facts are gathered; the template is presentation. Mirrors the
 * build-content / build-email / send shape of the UserSendNotification template.
 */

import type { SendEmailOptions } from "../types";
import { sendEmail } from "../emailService";
import {
  wrapInBaseTemplate,
  createButton,
  createDivider,
  BRAND_COLORS,
  EMAIL_FONT_STACKS,
  escapeHtml,
} from "./base";

/** A single dated thing Alloro did, already resolved to plain English. */
export interface OwnerWeeklyDigestWorkItem {
  /** Past-tense label, e.g. "Google post published". */
  label: string;
  /** Short human date, e.g. "Jul 21". */
  date: string;
}

/** One funnel gate as measured for the period. */
export interface OwnerWeeklyDigestGate {
  /** Gate label, e.g. "Google Visibility". */
  label: string;
  /** Sub-label under the number, e.g. "How often you showed up on Google". */
  metaLabel: string;
  /** Measured value, or null when the source is not connected yet. */
  value: number | null;
  /** False renders the honest "not connected yet" state instead of a zero. */
  available: boolean;
}

export interface OwnerWeeklyDigestData {
  /** Practice / organization name. */
  organizationName: string;
  /** Greeting name — set only when there is a single recipient. */
  recipientName?: string;
  /** Window the work recap covers, e.g. "Jul 14–21". */
  periodLabel: string;
  work: {
    /** Total published items in the window (posts + replies + info updates). */
    total: number;
    localPosts: number;
    reviewReplies: number;
    /** Google Business Profile info updates (hours, NAP, etc.). */
    businessInfoUpdates: number;
    /** Most-recent dated items to show, newest first. */
    recentItems: OwnerWeeklyDigestWorkItem[];
  };
  funnel: {
    /** Month the gates describe, e.g. "July 2026". */
    monthLabel: string;
    /** Ordered impressions → visits → leads. */
    gates: OwnerWeeklyDigestGate[];
  };
  /** Absolute dashboard URL for the CTA. */
  dashboardUrl: string;
}

function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

/** One plain-English sentence of what Alloro did — only the nonzero parts. */
function buildWorkSentence(work: OwnerWeeklyDigestData["work"]): string {
  const parts: string[] = [];
  if (work.localPosts > 0) {
    parts.push(
      `${work.localPosts} Google ${pluralize(work.localPosts, "post", "posts")}`
    );
  }
  if (work.reviewReplies > 0) {
    parts.push(
      `${work.reviewReplies} review ${pluralize(
        work.reviewReplies,
        "reply",
        "replies"
      )}`
    );
  }
  if (work.businessInfoUpdates > 0) {
    parts.push(
      `${work.businessInfoUpdates} business-info ${pluralize(
        work.businessInfoUpdates,
        "update",
        "updates"
      )}`
    );
  }
  if (parts.length === 0) {
    return "Alloro didn't publish anything new for you this week.";
  }
  return `This week, Alloro published ${joinParts(parts)} for you.`;
}

/** Join 1–3 clause fragments as "a", "a and b", or "a, b, and c". */
function joinParts(parts: string[]): string {
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

function renderWorkItems(items: OwnerWeeklyDigestWorkItem[]): string {
  if (items.length === 0) return "";
  const rows = items
    .map(
      (item) => `
      <tr>
        <td style="padding: 8px 0; border-bottom: 1px solid ${
          BRAND_COLORS.border
        };">
          <span style="font-size: 12px; color: ${
            BRAND_COLORS.mediumGray
          }; font-weight: 700; letter-spacing: 0.5px;">
            ${escapeHtml(item.date)}
          </span>
          <span style="font-size: 14px; color: ${
            BRAND_COLORS.darkGray
          }; margin-left: 10px;">
            ${escapeHtml(item.label)}
          </span>
        </td>
      </tr>`
    )
    .join("");
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-top: 12px;">
      ${rows}
    </table>`;
}

function formatGateValue(gate: OwnerWeeklyDigestGate): string {
  if (!gate.available || gate.value === null) {
    return `<span style="font-size: 14px; color: ${BRAND_COLORS.mediumGray}; font-style: italic;">Not connected yet</span>`;
  }
  return `<span style="font-size: 22px; font-weight: 700; color: ${
    BRAND_COLORS.navy
  }; font-family: ${EMAIL_FONT_STACKS.display};">${gate.value.toLocaleString(
    "en-US"
  )}</span>`;
}

function renderGates(gates: OwnerWeeklyDigestGate[]): string {
  return gates
    .map(
      (gate) => `
      <tr>
        <td style="padding: 14px 0; border-bottom: 1px solid ${
          BRAND_COLORS.border
        };">
          <p style="margin: 0 0 2px 0; font-size: 14px; font-weight: 700; color: ${
            BRAND_COLORS.navy
          };">${escapeHtml(gate.label)}</p>
          <p style="margin: 0; font-size: 12px; color: ${
            BRAND_COLORS.mediumGray
          };">${escapeHtml(gate.metaLabel)}</p>
        </td>
        <td align="right" style="padding: 14px 0; border-bottom: 1px solid ${
          BRAND_COLORS.border
        };">
          ${formatGateValue(gate)}
        </td>
      </tr>`
    )
    .join("");
}

/**
 * Build the inner HTML for the digest. Pure presentation of the given data.
 */
export function buildOwnerWeeklyDigestContent(
  data: OwnerWeeklyDigestData
): string {
  const sections: string[] = [];

  // Header
  sections.push(`
    <div style="text-align: center; margin-bottom: 24px;">
      <p style="margin: 0 0 8px 0; font-size: 12px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase; color: ${
        BRAND_COLORS.orange
      };">Your weekly recap</p>
      <h1 style="margin: 0 0 6px 0; font-size: 24px; font-weight: 700; color: ${
        BRAND_COLORS.navy
      }; font-family: ${EMAIL_FONT_STACKS.display};">
        ${
          // The headline must not contradict the sentence under it: an org can
          // reach this email on a funnel gate alone, with zero published work.
          data.work.total > 0
            ? "Here's what Alloro did this week"
            : "Your week with Alloro"
        }
      </h1>
      <p style="margin: 0; font-size: 14px; color: ${
        BRAND_COLORS.mediumGray
      };">${escapeHtml(data.organizationName)} · ${escapeHtml(
    data.periodLabel
  )}</p>
    </div>
  `);

  // Greeting (single recipient only)
  if (data.recipientName) {
    sections.push(`
      <p style="margin: 0 0 16px 0; font-size: 15px; color: ${
        BRAND_COLORS.darkGray
      };">Hi ${escapeHtml(data.recipientName)},</p>
    `);
  }

  // What Alloro did
  sections.push(`
    <div style="background-color: ${
      BRAND_COLORS.lightGray
    }; padding: 20px; border-radius: 12px; margin-bottom: 8px;">
      <p style="margin: 0; font-size: 15px; line-height: 1.7; color: ${
        BRAND_COLORS.darkGray
      };">${escapeHtml(buildWorkSentence(data.work))}</p>
      ${renderWorkItems(data.work.recentItems)}
    </div>
  `);

  sections.push(createDivider());

  // Where the practice stands
  sections.push(`
    <p style="margin: 0 0 4px 0; font-size: 16px; font-weight: 700; color: ${
      BRAND_COLORS.navy
    };">Where ${escapeHtml(data.organizationName)} stands</p>
    <p style="margin: 0 0 8px 0; font-size: 12px; color: ${
      BRAND_COLORS.mediumGray
    };">${escapeHtml(data.funnel.monthLabel)}</p>
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
      ${renderGates(data.funnel.gates)}
    </table>
  `);

  // CTA
  sections.push(`
    <div style="text-align: center; margin-top: 24px;">
      ${createButton("See your full report", data.dashboardUrl)}
    </div>
  `);

  // Footer note
  sections.push(`
    <p style="margin: 20px 0 0 0; font-size: 12px; color: ${BRAND_COLORS.mediumGray}; text-align: center;">
      This is your weekly recap from Alloro.
    </p>
  `);

  return sections.join("");
}

/** Build the full send payload (subject + wrapped body + preheader). */
export function buildOwnerWeeklyDigestEmail(
  data: OwnerWeeklyDigestData
): SendEmailOptions {
  const content = buildOwnerWeeklyDigestContent(data);
  const preheader = buildWorkSentence(data.work).slice(0, 100);
  const body = wrapInBaseTemplate(content, {
    preheader,
    showFooterLinks: true,
  });

  return {
    subject: `Your week with Alloro — ${data.organizationName}`,
    body,
    recipients: [],
    preheader,
  };
}

/**
 * Send the digest to the resolved owner recipients. The caller supplies the
 * recipient list (resolved server-side); the interceptor still governs
 * non-production sends, and `category` tags the email_logs row.
 */
export async function sendOwnerWeeklyDigest(
  data: OwnerWeeklyDigestData,
  recipients: string[]
) {
  const email = buildOwnerWeeklyDigestEmail(data);
  return sendEmail({ ...email, recipients, category: "notification" });
}

export default sendOwnerWeeklyDigest;
