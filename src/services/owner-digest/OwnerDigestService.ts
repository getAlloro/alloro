/**
 * Owner Weekly Digest — composition + send orchestration.
 *
 * Top-level shared service (§6.2): it spans several domains — the proof receipt
 * (what Alloro did), the patient-journey funnel (where the practice stands),
 * organizations/locations/members, and the email send path — so it lives in
 * src/services/ rather than any one domain's feature-services/.
 *
 * It holds NO database access of its own (§7.3/§7.4): every read goes through a
 * model or an existing domain service, and the send goes through the existing
 * email template + sendEmail path (never a hand-rolled email).
 *
 * Honesty (Value #6): the digest states only logged, measured facts. It invents
 * no change figure, promises nothing, and — critically — does not send an org a
 * hollow "we did nothing and know nothing" email: an org is skipped when there
 * is neither work in the window NOR a single connected funnel gate.
 *
 * Client-send safety: runWeeklyDigest is a no-op unless the
 * OWNER_WEEKLY_DIGEST_ENABLED kill-switch is on. Recipients are the org's
 * ADMIN members only, resolved server-side — never from any request input.
 */

import { OrganizationModel } from "../../models/OrganizationModel";
import { LocationModel } from "../../models/LocationModel";
import { OrganizationUserModel } from "../../models/OrganizationUserModel";
import { ProofReceiptService } from "../../controllers/proof-receipt/feature-services/ProofReceiptService";
import type { ProofReceipt } from "../../controllers/proof-receipt/ProofReceiptTypes";
import { assemblePatientJourney } from "../../controllers/patient-journey/feature-services/PatientJourneyService";
import type {
  PatientJourney,
  PatientJourneyStageKey,
} from "../../controllers/patient-journey/feature-utils/types";
import type { GbpContentType } from "../../models/GbpWorkItemModel";
import {
  sendOwnerWeeklyDigest,
  type OwnerWeeklyDigestData,
  type OwnerWeeklyDigestGate,
  type OwnerWeeklyDigestWorkItem,
} from "../../emails";
import { APP_URL } from "../../emails/templates/base";
import {
  OWNER_WEEKLY_DIGEST_WINDOW_DAYS,
  OWNER_WEEKLY_DIGEST_RECENT_ITEMS_MAX,
  OWNER_WEEKLY_DIGEST_ITEM_SCAN_LIMIT,
  isOwnerWeeklyDigestEnabled,
} from "../../config/ownerWeeklyDigest";
import logger from "../../lib/logger";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const SHORT_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const LONG_MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Plain-English, past-tense label for each logged work-item type. */
const WORK_ITEM_LABELS: Record<GbpContentType, string> = {
  review_reply: "Review reply posted",
  local_post: "Google post published",
  business_info: "Business info updated",
};

export interface OwnerDigestWindow {
  since: Date;
  until: Date;
}

export interface OwnerDigestComposition {
  data: OwnerWeeklyDigestData;
  recipients: string[];
}

export type OwnerDigestOutcome = "sent" | "skipped" | "failed";

export interface OwnerDigestRunResult {
  enabled: boolean;
  eligible: number;
  sent: number;
  skipped: number;
  failed: number;
}

/** Trailing window ending now (the recap covers the last N days). */
function getWeeklyWindow(now: Date): OwnerDigestWindow {
  return {
    since: new Date(now.getTime() - OWNER_WEEKLY_DIGEST_WINDOW_DAYS * MS_PER_DAY),
    until: now,
  };
}

function formatShortDate(date: Date): string {
  return `${SHORT_MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}`;
}

/** e.g. "Jul 14–21" (same month) or "Jul 28–Aug 3" (across months). */
function formatWindowLabel(window: OwnerDigestWindow): string {
  const start = window.since;
  const end = window.until;
  const startLabel = formatShortDate(start);
  const endLabel =
    start.getUTCMonth() === end.getUTCMonth()
      ? String(end.getUTCDate())
      : formatShortDate(end);
  return `${startLabel}–${endLabel}`;
}

/** Current calendar month as the funnel's "YYYY-MM-01" report key (UTC). */
function currentReportMonth(now: Date): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}-01`;
}

function fallbackMonthLabel(now: Date): string {
  return `${LONG_MONTHS[now.getUTCMonth()]} ${now.getUTCFullYear()}`;
}

/**
 * Admin members with a usable email, de-duplicated (case-insensitive).
 *
 * Reads through `listUsersForOrg`, which selects id/email/name/role — not
 * `listByOrgWithUsers`, which also selects `users.password_hash` (§5.3). This
 * service needs three fields; pulling bcrypt hashes into it is one stray
 * `logger.info({ members })` away from writing them to the worker log.
 */
async function resolveAdminRecipients(
  organizationId: number
): Promise<{ email: string; name: string | null }[]> {
  const members = await OrganizationUserModel.listUsersForOrg(organizationId);
  const seen = new Set<string>();
  const recipients: { email: string; name: string | null }[] = [];
  for (const member of members) {
    if (member.role !== "admin") continue;
    const email = member.email?.trim();
    if (!email) continue;
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    recipients.push({ email, name: member.name ?? null });
  }
  return recipients;
}

/** Map the proof receipt into the email's work summary. */
function buildWorkSummary(receipt: ProofReceipt): OwnerWeeklyDigestData["work"] {
  const recentItems: OwnerWeeklyDigestWorkItem[] = receipt.items
    .slice(0, OWNER_WEEKLY_DIGEST_RECENT_ITEMS_MAX)
    .map((item) => ({
      label: WORK_ITEM_LABELS[item.type] ?? "Work published",
      date: formatShortDate(new Date(item.at)),
    }));
  // Every count in the owner's first sentence is read straight off the
  // receipt's measured per-type counts. This number was previously derived as
  // `total - localPosts - reviewReplies`; `total` and the per-type counts come
  // from two separate queries, so a row published between them would have made
  // the subtraction claim a business-info update that never happened.
  return {
    total: receipt.summary.total,
    localPosts: receipt.summary.localPosts,
    reviewReplies: receipt.summary.reviewReplies,
    businessInfoUpdates: receipt.summary.businessInfo,
    recentItems,
  };
}

/** The three funnel gates in impressions → visits → leads order. */
const GATE_ORDER: PatientJourneyStageKey[] = [
  "impressions",
  "visits",
  "leads",
];

function buildGates(journey: PatientJourney | null): OwnerWeeklyDigestGate[] {
  if (!journey) {
    // Funnel could not be assembled — render every gate as honestly unavailable
    // rather than fabricating zeros.
    return [
      { label: "Google Visibility", metaLabel: "How often you showed up on Google", value: null, available: false },
      { label: "Website Visitors", metaLabel: "Website visitors", value: null, available: false },
      { label: "Website Leads", metaLabel: "Verified submissions", value: null, available: false },
    ];
  }
  return GATE_ORDER.map((key) => {
    const stage = journey.stages.find((candidate) => candidate.key === key);
    return {
      label: stage?.label ?? key,
      metaLabel: stage?.metaLabel ?? "",
      value: stage?.value ?? null,
      available: Boolean(stage?.available),
    };
  });
}

/** Assemble the funnel for the org, degrading to null on any failure. */
async function readFunnel(
  organizationId: number,
  now: Date
): Promise<PatientJourney | null> {
  const locations = await LocationModel.findByOrganizationId(organizationId);
  if (locations.length === 0) return null;
  const primary = locations.find((location) => location.is_primary) ?? locations[0];
  try {
    return await assemblePatientJourney({
      organizationId,
      locationId: primary.id,
      reportMonth: currentReportMonth(now),
    });
  } catch (err) {
    logger.warn(
      { err, organizationId },
      "[owner-digest] funnel assembly failed; digest funnel section degrades to unavailable"
    );
    return null;
  }
}

export class OwnerDigestService {
  static getWeeklyWindow(now: Date = new Date()): OwnerDigestWindow {
    return getWeeklyWindow(now);
  }

  /**
   * Build the digest payload + recipients for one org, or null when there is
   * nothing to send: no admin recipients, or neither work in the window nor a
   * single connected funnel gate.
   */
  static async composeForOrg(
    organizationId: number,
    now: Date = new Date()
  ): Promise<OwnerDigestComposition | null> {
    const organization = await OrganizationModel.findById(organizationId);
    if (!organization || organization.archived_at) return null;

    const recipients = await resolveAdminRecipients(organizationId);
    if (recipients.length === 0) {
      logger.info(
        { organizationId },
        "[owner-digest] skipped — no admin recipients"
      );
      return null;
    }

    const window = getWeeklyWindow(now);
    const locations = await LocationModel.findByOrganizationId(organizationId);
    const accessibleLocationIds = locations.map((location) => location.id);

    const [receipt, journey] = await Promise.all([
      ProofReceiptService.getReceipt({
        organizationId,
        accessibleLocationIds,
        since: window.since,
        until: window.until,
        page: 1,
        limit: OWNER_WEEKLY_DIGEST_ITEM_SCAN_LIMIT,
      }),
      readFunnel(organizationId, now),
    ]);

    const work = buildWorkSummary(receipt);
    const gates = buildGates(journey);

    const hasWork = work.total > 0;
    const hasFunnelSignal = gates.some((gate) => gate.available);
    if (!hasWork && !hasFunnelSignal) {
      logger.info(
        { organizationId },
        "[owner-digest] skipped — no work this week and no connected funnel gate"
      );
      return null;
    }

    const data: OwnerWeeklyDigestData = {
      organizationName: organization.name,
      recipientName:
        recipients.length === 1 ? recipients[0].name ?? undefined : undefined,
      periodLabel: formatWindowLabel(window),
      work,
      funnel: {
        monthLabel: journey?.period.label ?? fallbackMonthLabel(now),
        gates,
      },
      dashboardUrl: `${APP_URL}/dashboard`,
    };

    return { data, recipients: recipients.map((recipient) => recipient.email) };
  }

  /**
   * Compose + send for one org. Returns the outcome; never throws.
   *
   * Defense in depth: the client-send kill-switch is re-checked here, not only
   * in the batch, so any future caller of this method cannot email an owner
   * while OWNER_WEEKLY_DIGEST_ENABLED is off. composeForOrg is deliberately NOT
   * gated — it has no side effect and is safe to use for a preview.
   */
  static async sendForOrg(
    organizationId: number,
    now: Date = new Date()
  ): Promise<OwnerDigestOutcome> {
    if (!isOwnerWeeklyDigestEnabled()) return "skipped";
    try {
      const composed = await OwnerDigestService.composeForOrg(organizationId, now);
      if (!composed) return "skipped";
      const result = await sendOwnerWeeklyDigest(
        composed.data,
        composed.recipients
      );
      if (!result.success) {
        logger.warn(
          { organizationId, error: result.error },
          "[owner-digest] send failed for org"
        );
        return "failed";
      }
      return "sent";
    } catch (err) {
      logger.error(
        { err, organizationId },
        "[owner-digest] unexpected error composing/sending digest for org"
      );
      return "failed";
    }
  }

  /**
   * Run the weekly batch. No-op (and sends nothing) unless the kill-switch is
   * on. Per-org failures are isolated and logged — one bad org never sinks the
   * batch. The only throw is the pre-send eligibility lookup, so an
   * ERROR-driven BullMQ retry re-runs before any send and cannot double-send on
   * that path. Caveat (honest): there is no per-org sent-state yet, so a hard
   * process crash mid-batch followed by a retry WOULD re-email the orgs already
   * sent in the killed run. Acceptable while the feature is flag-gated off;
   * a `last_digest_sent_at` dedup is the follow-up before wide enablement.
   */
  static async runWeeklyDigest(
    now: Date = new Date()
  ): Promise<OwnerDigestRunResult> {
    if (!isOwnerWeeklyDigestEnabled()) {
      logger.info(
        "[owner-digest] OWNER_WEEKLY_DIGEST_ENABLED is off — no digests sent"
      );
      return { enabled: false, eligible: 0, sent: 0, skipped: 0, failed: 0 };
    }

    const eligibleIds = await OrganizationModel.findWeeklyDigestEligibleIds();
    let sent = 0;
    let skipped = 0;
    let failed = 0;
    for (const organizationId of eligibleIds) {
      const outcome = await OwnerDigestService.sendForOrg(organizationId, now);
      if (outcome === "sent") sent += 1;
      else if (outcome === "skipped") skipped += 1;
      else failed += 1;
    }

    logger.info(
      { eligible: eligibleIds.length, sent, skipped, failed },
      "[owner-digest] weekly digest batch complete"
    );
    return { enabled: true, eligible: eligibleIds.length, sent, skipped, failed };
  }
}
