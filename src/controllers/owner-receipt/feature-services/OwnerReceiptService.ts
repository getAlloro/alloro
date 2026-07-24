/**
 * Owner Receipt (the CMO's report) — assembles, read-only, for one org over a
 * PRE and a POST window: the dated actions Alloro took, the post-window gate
 * numbers with their honest before -> after trend, and the diagnosis of which
 * funnel term moved. It builds NOTHING new — it joins parts that already ship:
 *
 *   - dated actions ....... ProofReceiptService.getReceipt (owner-facing already)
 *   - impressions + trend . impressionsLiftReader.readImpressionsLift (PR #232,
 *                           GSC-organic, coverage-guarded — reused, not re-derived)
 *   - visits .............. stageReaders.readVisits (Rybbit, all-channel)
 *   - leads ............... FormSubmissionModel window count (verified submissions)
 *   - which term moved .... funnelMovementDiagnosis.diagnoseFunnelMovement (pure)
 *
 * Domain-local per §6.3 (single-domain orchestration in feature-services/). No
 * DB access of its own (§7.4) — every read goes through a model, an existing
 * service, or an existing reader. Degrades honestly and never throws (§3.1).
 *
 * HONESTY (Value #6): every metric carries its source + as-of date; an absent
 * value is `null` with a plain-words note, NEVER 0. No causal claim is made —
 * the numbers, the trend, and the diagnosis are returned; the owner concludes.
 * No owner-facing prose is emitted here (that is the frontend's job).
 */

import { ProofReceiptService } from "../../proof-receipt/feature-services/ProofReceiptService";
import type { ProofReceipt } from "../../proof-receipt/ProofReceiptTypes";
import { FormSubmissionModel } from "../../../models/website-builder/FormSubmissionModel";
import {
  readImpressionsLift,
  type DateWindow,
  type ImpressionsLiftResult,
  type ImpressionsWindowCoverage,
} from "../../patient-journey/feature-services/impressionsLiftReader";
import { readVisits } from "../../patient-journey/feature-services/stageReaders";
import type { StageRead } from "../../patient-journey/feature-services/stageReaders";
import {
  diagnoseFunnelMovement,
  type FunnelGateTriple,
} from "../../patient-journey/feature-utils/funnelMovementDiagnosis";
import logger from "../../../lib/logger";
import type {
  GetOwnerReceiptInput,
  OwnerReceipt,
  OwnerReceiptMetric,
  ReceiptWindow,
} from "../OwnerReceiptTypes";

/** UTC midnight for a `YYYY-MM-DD` day (start of that calendar day). */
function dayStartUtc(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

/** UTC midnight of the day AFTER `day` — the exclusive upper bound of `[.. , )`. */
function dayEndExclusiveUtc(day: string): Date {
  return new Date(dayStartUtc(day).getTime() + 86_400_000);
}

/**
 * An honest empty actions receipt for when the dated-actions read fails. It
 * fabricates NO action — an empty list over the real receipt window — so a dark
 * actions read degrades (§3.1) instead of sinking the whole receipt. Paired with
 * a logged warning at the call site (§3.2): the failure is recorded, not swallowed.
 */
function emptyActionsReceipt(
  input: GetOwnerReceiptInput,
  preWindow: DateWindow,
  postWindow: DateWindow
): ProofReceipt {
  return {
    organizationId: input.organizationId,
    ...(input.locationId !== undefined ? { locationId: input.locationId } : {}),
    since: dayStartUtc(preWindow.start),
    until: dayEndExclusiveUtc(postWindow.end),
    items: [],
    summary: { reviewReplies: 0, localPosts: 0, total: 0 },
    pagination: { page: input.page, limit: input.limit, total: 0, totalPages: 1 },
  };
}

/**
 * Post-window organic impressions, honesty-labelled. A partial window's sum is
 * NOT presented as a total (the lift reader's own rule) — value is only real
 * when the window is fully covered; otherwise `null` with the coverage note.
 */
function impressionsMetric(post: ImpressionsWindowCoverage | null): OwnerReceiptMetric {
  if (!post || post.storedDays === 0) {
    return {
      gate: "impressions",
      value: null,
      source: "gsc_organic",
      asOf: null,
      note: "not measured: no stored GSC-organic history in the post window",
    };
  }
  if (!post.fullyCovered) {
    return {
      gate: "impressions",
      value: null,
      source: "gsc_organic",
      asOf: post.latestStored,
      note: `not measured: post window only partially covered (${post.storedDays} of ${post.expectedDays} days stored)`,
    };
  }
  return {
    gate: "impressions",
    value: post.storedImpressions,
    source: "gsc_organic",
    asOf: post.latestStored,
    note: null,
  };
}

/** Map a StageRead (visits) to an honesty-labelled metric. */
function visitsMetric(read: StageRead | null): OwnerReceiptMetric {
  if (!read || !read.available) {
    return {
      gate: "visits",
      value: null,
      source: "rybbit",
      asOf: null,
      note: "not measured: website visits source not connected",
    };
  }
  return {
    gate: "visits",
    value: read.value,
    source: "rybbit",
    asOf: read.asOf,
    note: read.note ?? null,
  };
}

/**
 * Leads metric for the post window. A project with no verified submissions ever
 * is "not measured" (the lead source isn't established) — `null`, never 0. A
 * connected project with a genuine 0 in the window keeps the real 0.
 */
function leadsMetric(
  windowCount: number | null,
  hasEverHadLead: boolean,
  asOf: string
): OwnerReceiptMetric {
  if (windowCount === null || !hasEverHadLead) {
    return {
      gate: "leads",
      value: null,
      source: "form_submissions",
      asOf: null,
      note: "not measured: no verified form submissions recorded yet",
    };
  }
  return {
    gate: "leads",
    value: windowCount,
    source: "form_submissions",
    asOf,
    note: null,
  };
}

/** Impressions value usable for the diagnosis: only a fully-covered window total. */
function coveredImpressions(coverage: ImpressionsWindowCoverage | null): number | null {
  return coverage && coverage.fullyCovered ? coverage.storedImpressions : null;
}

/** Visits value for the diagnosis: the measured number, or `null` when absent. */
function readValue(read: StageRead | null): number | null {
  return read && read.available ? read.value : null;
}

export class OwnerReceiptService {
  /**
   * Assemble the owner receipt for one org over a PRE and a POST window.
   * Read-only. Never throws — a missing project or a failed read degrades that
   * part honestly (null + note) rather than sinking the whole receipt.
   */
  static async getReceipt(input: GetOwnerReceiptInput): Promise<OwnerReceipt> {
    const preWindow: DateWindow = input.preWindow;
    const postWindow: DateWindow = input.postWindow;

    // Dated actions span the whole receipt window [pre.start, post.end]. This
    // read is org-scoped (not project-scoped), so it stands even with no project.
    // Best-effort (§3.1/§3.2): a failed actions read degrades to an empty list —
    // logged, never swallowed — so one dark read can't sink the honest trend +
    // diagnosis. The docstring's "never throws" promise depends on this guard.
    let actions: ProofReceipt;
    try {
      actions = await ProofReceiptService.getReceipt({
        organizationId: input.organizationId,
        accessibleLocationIds: input.accessibleLocationIds,
        locationId: input.locationId,
        since: dayStartUtc(preWindow.start),
        until: dayEndExclusiveUtc(postWindow.end),
        page: input.page,
        limit: input.limit,
      });
    } catch (err) {
      logger.warn(
        { err, organizationId: input.organizationId },
        "[owner-receipt] dated-actions read failed; degrading actions to empty"
      );
      actions = emptyActionsReceipt(input, preWindow, postWindow);
    }

    // Honest before -> after impressions (organic, coverage-guarded). Reused —
    // never re-derived. This alone gives both windows' organic impression sums.
    const impressionsTrend = await readImpressionsLift(
      input.organizationId,
      preWindow,
      postWindow
    );
    const projectId = impressionsTrend.projectId;

    const { preVisits, postVisits, preLeads, postLeads, hasEverHadLead } =
      await this.readVisitsAndLeads(projectId, preWindow, postWindow);

    const metrics: OwnerReceiptMetric[] = [
      impressionsMetric(impressionsTrend.post),
      visitsMetric(postVisits),
      leadsMetric(postLeads, hasEverHadLead, clampAsOf(postWindow.end)),
    ];

    const diagnosis = diagnoseFunnelMovement(
      this.buildTriple(impressionsTrend.pre, preVisits, hasEverHadLead ? preLeads : null),
      this.buildTriple(impressionsTrend.post, postVisits, hasEverHadLead ? postLeads : null)
    );

    return {
      organizationId: input.organizationId,
      locationId: input.locationId,
      projectId,
      preWindow,
      postWindow,
      actions,
      metrics,
      impressionsTrend,
      diagnosis,
    };
  }

  /** One gate triple for the diagnosis from the resolved per-window values. */
  private static buildTriple(
    impressions: ImpressionsWindowCoverage | null,
    visits: StageRead | null,
    leads: number | null
  ): FunnelGateTriple {
    return {
      impressions: coveredImpressions(impressions),
      visits: readValue(visits),
      leads,
    };
  }

  /**
   * Read visits (both windows) and leads (both windows + all-time) for a
   * project. Every read is best-effort: a failure degrades that value to `null`
   * rather than throwing, so one dark source can't sink the receipt (§3.1).
   */
  private static async readVisitsAndLeads(
    projectId: string | null,
    preWindow: ReceiptWindow,
    postWindow: ReceiptWindow
  ): Promise<{
    preVisits: StageRead | null;
    postVisits: StageRead | null;
    preLeads: number | null;
    postLeads: number | null;
    hasEverHadLead: boolean;
  }> {
    if (!projectId) {
      return {
        preVisits: null,
        postVisits: null,
        preLeads: null,
        postLeads: null,
        hasEverHadLead: false,
      };
    }
    try {
      const [preVisits, postVisits, preLeads, postLeads, allTime] =
        await Promise.all([
          readVisits(projectId, preWindow.start, preWindow.end),
          readVisits(projectId, postWindow.start, postWindow.end),
          FormSubmissionModel.countVerifiedBetweenByProjectId(
            projectId,
            dayStartUtc(preWindow.start),
            dayEndExclusiveUtc(preWindow.end)
          ),
          FormSubmissionModel.countVerifiedBetweenByProjectId(
            projectId,
            dayStartUtc(postWindow.start),
            dayEndExclusiveUtc(postWindow.end)
          ),
          FormSubmissionModel.countVerifiedByProjectId(projectId),
        ]);
      return {
        preVisits,
        postVisits,
        preLeads,
        postLeads,
        hasEverHadLead: allTime > 0,
      };
    } catch (err) {
      logger.warn(
        { err, projectId },
        "[owner-receipt] visits/leads read failed"
      );
      return {
        preVisits: null,
        postVisits: null,
        preLeads: null,
        postLeads: null,
        hasEverHadLead: false,
      };
    }
  }
}

/** Never report an as-of date in the future for an in-progress window. */
function clampAsOf(day: string): string {
  const today = new Date().toISOString().slice(0, 10);
  return day < today ? day : today;
}
