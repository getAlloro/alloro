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
 * value is `null` with a plain-words note, NEVER 0. Each read reports WHY it is
 * absent, so a failed read is never rendered as a fact about the practice. No
 * causal claim is made — the numbers, the trend, and the diagnosis are
 * returned; the owner concludes. No owner-facing prose is emitted here (that is
 * the frontend's job).
 *
 * OUTBOUND CALLS: this is read-only with respect to our database, but it is NOT
 * purely local — `readVisits` issues one GET to the Rybbit analytics API per
 * window (two per receipt).
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
import { inclusiveDaySpan } from "../../../utils/receiptWindows";
import {
  impressionsMetric,
  leadsMetric,
  visitsMetric,
  type MetricAvailability,
} from "../feature-utils/receiptMetrics";
import logger from "../../../lib/logger";
import type {
  GetOwnerReceiptInput,
  OwnerReceipt,
  OwnerReceiptMetric,
  ReceiptWindow,
} from "../OwnerReceiptTypes";

const MS_PER_DAY = 86_400_000;

/** UTC midnight for a `YYYY-MM-DD` day (start of that calendar day). */
function dayStartUtc(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

/** UTC midnight of the day AFTER `day` — the exclusive upper bound of `[.. , )`. */
function dayEndExclusiveUtc(day: string): Date {
  return new Date(dayStartUtc(day).getTime() + MS_PER_DAY);
}

/**
 * A placeholder actions receipt for when the dated-actions read fails. It
 * fabricates NO action — an empty list over the real receipt window — so a dark
 * actions read degrades (§3.1) instead of sinking the whole receipt.
 *
 * IMPORTANT: this object is indistinguishable from a true "Alloro did nothing
 * this window". That is why `OwnerReceipt.actionsAvailable` exists — the flag,
 * not the shape, is what tells a consumer this is a failure and not a zero.
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

const ACTIONS_UNAVAILABLE_NOTE =
  "we could not load the list of actions just now — this is not a count of zero";

/** Impressions value usable for the diagnosis: only a fully-covered window total. */
function coveredImpressions(coverage: ImpressionsWindowCoverage | null): number | null {
  return coverage && coverage.fullyCovered ? coverage.storedImpressions : null;
}

/** Visits value for the diagnosis: the measured number, or `null` when absent. */
function readValue(read: StageRead | null): number | null {
  return read && read.available ? read.value : null;
}

/** What `readVisitsAndLeads` resolved, per read, with WHY each value is absent. */
interface VisitsAndLeadsRead {
  preVisits: StageRead | null;
  postVisits: StageRead | null;
  visitsKind: MetricAvailability;
  preLeads: number | null;
  postLeads: number | null;
  leadsKind: MetricAvailability;
  hasEverHadLead: boolean;
}

export class OwnerReceiptService {
  /**
   * Assemble the owner receipt for one org over a PRE and a POST window.
   *
   * Read-only against our database (it does make two outbound Rybbit GETs).
   * Never throws — unconditionally, not aspirationally: a missing project or a
   * failed read degrades that part honestly (null + a note that says the read
   * failed), and an unexpected fault anywhere in the assembly degrades the
   * whole receipt rather than 500-ing the endpoint.
   */
  static async getReceipt(input: GetOwnerReceiptInput): Promise<OwnerReceipt> {
    const preWindow: DateWindow = input.preWindow;
    const postWindow: DateWindow = input.postWindow;

    try {
      return await this.assembleReceipt(input, preWindow, postWindow);
    } catch (err) {
      // The individual reads below are already guarded; this is the backstop
      // that makes the "never throws" promise in the docstring unconditional
      // instead of a claim about today's callees. The dated-actions instance of
      // exactly this bug was real and shipped.
      logger.error(
        { err, organizationId: input.organizationId },
        "[owner-receipt] receipt assembly failed; degrading the whole receipt"
      );
      return this.degradedReceipt(input, preWindow, postWindow);
    }
  }

  /** The real assembly. Every read inside is individually best-effort. */
  private static async assembleReceipt(
    input: GetOwnerReceiptInput,
    preWindow: DateWindow,
    postWindow: DateWindow
  ): Promise<OwnerReceipt> {
    // Dated actions span the whole receipt window [pre.start, post.end]. This
    // read is org-scoped (not project-scoped), so it stands even with no project.
    // Best-effort (§3.1/§3.2): a failed actions read degrades to an empty list —
    // logged, never swallowed — so one dark read can't sink the honest trend +
    // diagnosis. `actionsAvailable` is what keeps that from reading as a zero.
    let actions: ProofReceipt;
    let actionsAvailable = true;
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
      actionsAvailable = false;
    }

    // Honest before -> after impressions (organic, coverage-guarded). Reused —
    // never re-derived. This alone gives both windows' organic impression sums.
    const impressionsTrend = await readImpressionsLift(
      input.organizationId,
      preWindow,
      postWindow
    );
    const projectId = impressionsTrend.projectId;

    const reads = await this.readVisitsAndLeads(projectId, preWindow, postWindow);

    const metrics: OwnerReceiptMetric[] = [
      impressionsMetric(impressionsTrend),
      visitsMetric(reads.postVisits, reads.visitsKind),
      leadsMetric(
        reads.postLeads,
        reads.hasEverHadLead,
        clampAsOf(postWindow.end),
        reads.leadsKind
      ),
    ];

    // Window length travels INTO the diagnosis so it can refuse a decomposition
    // across windows of different lengths — two of the three gates are counts.
    const preSpan = inclusiveDaySpan(preWindow.start, preWindow.end);
    const postSpan = inclusiveDaySpan(postWindow.start, postWindow.end);
    const diagnosis = diagnoseFunnelMovement(
      this.buildTriple(
        impressionsTrend.pre,
        reads.preVisits,
        reads.hasEverHadLead ? reads.preLeads : null,
        preSpan
      ),
      this.buildTriple(
        impressionsTrend.post,
        reads.postVisits,
        reads.hasEverHadLead ? reads.postLeads : null,
        postSpan
      )
    );

    return {
      organizationId: input.organizationId,
      locationId: input.locationId,
      projectId,
      preWindow,
      postWindow,
      actions,
      actionsAvailable,
      actionsNote: actionsAvailable ? null : ACTIONS_UNAVAILABLE_NOTE,
      metrics,
      impressionsTrend,
      diagnosis,
    };
  }

  /**
   * The receipt we return when assembly itself failed. Everything is absent and
   * says so — nothing here can be mistaken for a measured value.
   */
  private static degradedReceipt(
    input: GetOwnerReceiptInput,
    preWindow: DateWindow,
    postWindow: DateWindow
  ): OwnerReceipt {
    const failedTrend: ImpressionsLiftResult = {
      organizationId: input.organizationId,
      projectId: null,
      source: "gsc_organic",
      excludes: ["gbp_maps"],
      pre: null,
      post: null,
      delta: null,
      pctChange: null,
      sufficient: false,
      reason: "we could not read your search history just now",
      failureKind: "read_failed",
      history: { earliest: null, latest: null },
    };
    const nothing: FunnelGateTriple = {
      impressions: null,
      visits: null,
      leads: null,
      spanDays: null,
    };

    return {
      organizationId: input.organizationId,
      locationId: input.locationId,
      projectId: null,
      preWindow,
      postWindow,
      actions: emptyActionsReceipt(input, preWindow, postWindow),
      actionsAvailable: false,
      actionsNote: ACTIONS_UNAVAILABLE_NOTE,
      metrics: [
        impressionsMetric(failedTrend),
        visitsMetric(null, "read_failed"),
        leadsMetric(null, false, clampAsOf(postWindow.end), "read_failed"),
      ],
      impressionsTrend: failedTrend,
      diagnosis: diagnoseFunnelMovement(nothing, nothing),
    };
  }

  /** One gate triple for the diagnosis from the resolved per-window values. */
  private static buildTriple(
    impressions: ImpressionsWindowCoverage | null,
    visits: StageRead | null,
    leads: number | null,
    spanDays: number | null
  ): FunnelGateTriple {
    return {
      impressions: coveredImpressions(impressions),
      visits: readValue(visits),
      leads,
      spanDays,
    };
  }

  /**
   * Read visits (both windows) and leads (both windows + all-time) for a
   * project.
   *
   * Each of the five reads settles INDEPENDENTLY (§3.2). `Promise.all` used to
   * reject on the first failure and discard the settled results, so a Rybbit
   * timeout threw away a perfectly healthy `form_submissions` count and the
   * owner was told "no verified form submissions recorded yet" — a false
   * statement about their practice caused by an unrelated third-party outage.
   */
  private static async readVisitsAndLeads(
    projectId: string | null,
    preWindow: ReceiptWindow,
    postWindow: ReceiptWindow
  ): Promise<VisitsAndLeadsRead> {
    if (!projectId) {
      return {
        preVisits: null,
        postVisits: null,
        visitsKind: "no_project",
        preLeads: null,
        postLeads: null,
        leadsKind: "no_project",
        hasEverHadLead: false,
      };
    }

    const [preVisits, postVisits, preLeads, postLeads, allTime] =
      await Promise.allSettled([
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

    this.logSettledFailures(projectId, [
      ["pre visits", preVisits],
      ["post visits", postVisits],
      ["pre leads", preLeads],
      ["post leads", postLeads],
      ["all-time leads", allTime],
    ]);

    // A leads number is only trustworthy alongside a successful all-time read:
    // that read is what separates "connected source, genuinely zero this window"
    // from "no lead source established". If it failed we do not know which.
    const leadsFailed =
      postLeads.status === "rejected" || allTime.status === "rejected";

    return {
      preVisits: preVisits.status === "fulfilled" ? preVisits.value : null,
      postVisits: postVisits.status === "fulfilled" ? postVisits.value : null,
      visitsKind: postVisits.status === "fulfilled" ? "measured" : "read_failed",
      preLeads: preLeads.status === "fulfilled" ? preLeads.value : null,
      postLeads: postLeads.status === "fulfilled" ? postLeads.value : null,
      leadsKind: leadsFailed ? "read_failed" : "measured",
      hasEverHadLead: allTime.status === "fulfilled" && allTime.value > 0,
    };
  }

  /** Log every rejected read individually — a failure is recorded, never swallowed (§3.2). */
  private static logSettledFailures(
    projectId: string,
    results: [string, PromiseSettledResult<unknown>][]
  ): void {
    for (const [label, result] of results) {
      if (result.status === "rejected") {
        logger.warn(
          { err: result.reason, projectId, read: label },
          "[owner-receipt] a receipt read failed; degrading that value only"
        );
      }
    }
  }
}

/** Never report an as-of date in the future for an in-progress window. */
function clampAsOf(day: string): string {
  const today = new Date().toISOString().slice(0, 10);
  return day < today ? day : today;
}
