/**
 * Patient Journey Insights — funnel-assembly service (T4).
 *
 * Assembles the `PatientJourney` response for one location + report month by
 * calling existing models/services only (no inline db, §7.4). Mirrors the
 * gbp-automation domain shape: a thin orchestrator here, per-stage readers in
 * `stageReaders.ts`, pure math/period helpers in `feature-utils/funnelMath.ts`.
 *
 * Tenant scope is never derived here — `organizationId`/`locationId` arrive as
 * required args resolved from the request context by the controller
 * (§5.5/§11.7). Every stage degrades independently: a missing source yields an
 * honest "not connected" stage (value null, available false), never a zero.
 */

import { OrganizationModel } from "../../../models/OrganizationModel";
import { LocationModel } from "../../../models/LocationModel";
import { ProjectModel } from "../../../models/website-builder/ProjectModel";
import logger from "../../../lib/logger";
import type {
  PatientJourney,
  PatientJourneyInput,
  PatientJourneyLocation,
  PatientJourneyStage,
  OrgType,
} from "../feature-utils/types";
import { buildMemorableCard } from "../feature-utils/memorableCard";
import { ReviewModel } from "../../../models/website-builder/ReviewModel";
import { GbpReadinessService } from "../../gbp-automation/feature-services/GbpReadinessService";
import { MetricActionService } from "../../../services/MetricActionService";
import { buildBookableCandidate } from "../feature-utils/funnelMath";
import {
  buildConversions,
  buildHeadline,
  buildPeriod,
  isCurrentUtcMonth,
  monthBounds,
} from "../feature-utils/funnelMath";
import {
  readImpressions,
  readVisits,
  readLeads,
  readPms,
  readRank,
  readReviews,
  type StageRead,
} from "./stageReaders";

export class PatientJourneyNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PatientJourneyNotFoundError";
  }
}

interface ResolvedEntities {
  location: PatientJourneyLocation;
  projectId: string | null;
}

interface ReplyOpportunity {
  unrepliedCount: number;
  isDraftPathWired: boolean;
}

/** Resolve org/location/project context + org-type + multi-location flag. */
async function resolveEntities(
  input: PatientJourneyInput,
): Promise<ResolvedEntities> {
  const location = await LocationModel.findById(input.locationId);
  if (!location || location.organization_id !== input.organizationId) {
    throw new PatientJourneyNotFoundError(
      `Location ${input.locationId} not found for organization ${input.organizationId}`,
    );
  }
  const organization = await OrganizationModel.findById(input.organizationId);
  if (!organization) {
    throw new PatientJourneyNotFoundError(
      `Organization ${input.organizationId} not found`,
    );
  }

  const countRow = await LocationModel.countByOrganizationId(
    input.organizationId,
  );
  const locationCount = Number(countRow?.count ?? 0);
  const project = await ProjectModel.findByOrganizationId(input.organizationId);
  const orgType: OrgType =
    organization.organization_type === "generic" ? "generic" : "health";

  return {
    location: {
      id: location.id,
      name: location.name,
      organizationId: input.organizationId,
      orgType,
      isMultiLocation: locationCount > 1,
    },
    projectId: project?.id ?? null,
  };
}

async function readReplyOpportunity(
  organizationId: number,
  locationId: number,
): Promise<ReplyOpportunity> {
  const [replyable, readiness] = await Promise.all([
    ReviewModel.findReplyableForLocation(locationId, { limit: 25 }).catch(
      (err) => {
        logger.warn(
          { err, organizationId, locationId },
          "[patient-journey] replyable review enrichment failed",
        );
        return [];
      },
    ),
    GbpReadinessService.getLocationReadiness(organizationId, locationId).catch(
      (err) => {
        logger.warn(
          { err, organizationId, locationId },
          "[patient-journey] reply readiness enrichment failed",
        );
        return null;
      },
    ),
  ]);

  return {
    unrepliedCount: replyable.length,
    isDraftPathWired: Boolean(readiness?.ready),
  };
}

function toStage(
  key: PatientJourneyStage["key"],
  label: string,
  metaLabel: string,
  source: string,
  read: StageRead,
  shared: boolean,
  isMultiLocation: boolean,
): PatientJourneyStage {
  const stage: PatientJourneyStage = {
    key,
    label,
    metaLabel,
    value: read.value,
    available: read.available,
    source,
    asOf: read.asOf,
    shared,
  };
  if (read.unavailableReason) stage.unavailableReason = read.unavailableReason;
  if (read.note) stage.note = read.note;
  if (read.metadata) stage.metadata = read.metadata;
  if (shared && isMultiLocation) {
    // Honest for ALL three shared gates. It must NOT say "website": the
    // impressions gate now folds in whole-practice GBP Maps (not just the
    // website), and this note SHADOWS the corrected source in the SPA
    // (patientJourney.utils.ts stageTooltip: `note?.trim() || source`), so a
    // "website total" here would silently mislabel the combined number.
    const wholePractice = "Whole-practice total — all locations.";
    stage.note = stage.note ? `${stage.note} ${wholePractice}` : wholePractice;
  }
  return stage;
}

/** Assemble the full Patient Journey response for a location + month. */
export async function assemblePatientJourney(
  input: PatientJourneyInput,
): Promise<PatientJourney> {
  const { location, projectId } = await resolveEntities(input);
  const period = buildPeriod(input.reportMonth);
  const { start: monthStart, end: monthEnd } = monthBounds(input.reportMonth);
  const prevMonthStart = new Date(
    Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() - 1, 1),
  );
  const isMulti = location.isMultiLocation;
  const isCurrentMonth = isCurrentUtcMonth(input.reportMonth);

  const emptyRead: StageRead = { value: null, available: false, asOf: null };

  // Website-traffic stages need a project; per-location stages do not.
  const [
    impressions,
    visits,
    leads,
    pms,
    rank,
    reviews,
    priorReviews,
    replyOpportunity,
    latestMetricAction,
  ] =
    await Promise.all([
      projectId
        ? readImpressions(
            projectId,
            period.startDate,
            period.endDate,
            isCurrentMonth,
            // Whole-practice Maps sum across all the org's locations — the
            // impressions gate is a shared, org-wide aggregate (not per-tab).
            input.organizationId,
          )
        : Promise.resolve(emptyRead),
      projectId
        ? readVisits(projectId, period.startDate, period.endDate)
        : Promise.resolve(emptyRead),
      projectId
        ? readLeads(projectId, monthStart, monthEnd)
        : Promise.resolve({
            ...emptyRead,
            unavailableReason: "not_connected" as const,
          }),
      readPms(input.organizationId, input.locationId),
      readRank(input.organizationId, input.locationId),
      readReviews(input.locationId, monthStart, monthEnd),
      readReviews(input.locationId, prevMonthStart, monthStart),
      readReplyOpportunity(
        input.organizationId,
        input.locationId,
      ),
      projectId
        ? MetricActionService.findLatestForJourney({
            organizationId: location.organizationId,
            locationId: location.id,
            projectId,
            periodStart: monthStart,
            periodEnd: monthEnd,
          })
        : Promise.resolve(null),
    ]);

  const memorableCard = buildMemorableCard({
    currentNewThisMonth: reviews.newThisMonth,
    priorNewThisMonth: priorReviews.newThisMonth,
    // Velocity rung DISABLED until a real per-location date-coverage signal exists.
    // `available` only means "has >=1 review", NOT that review_created_at is reliable:
    // a bulk import stamped at one date fabricates a month-over-month "drop"
    // (pressure-test 2026-07-13). Until a true date-reliability signal is wired, this
    // stays false so the velocity rung never fires on a date artifact. The reply-gap
    // rung (primary, done-for-you) is unaffected.
    velocityDatesReliable: false,
    unrepliedCount: replyOpportunity.unrepliedCount,
    // Done-for-you variant is honest only when a reply could ACTUALLY deploy:
    // readiness checks the live Google connection, scope, GBP property AND the
    // review_reply_enabled setting together. Gating on the setting alone could
    // promise "Alloro can post for you" while an actual deploy would fail.
    replyDraftPathWired: replyOpportunity.isDraftPathWired,
    repliedByAlloroCount: null,
  });

  const stages: PatientJourneyStage[] = [
    {
      ...toStage(
        "impressions",
        "Google Visibility",
        "How often you showed up on Google",
        "Google Search Console + Business Profile",
        impressions,
        true,
        isMulti,
      ),
      actions: latestMetricAction ? [latestMetricAction] : [],
    },
    toStage(
      "visits",
      "Website Visitors",
      "Website visitors",
      "Rybbit analytics",
      visits,
      true,
      isMulti,
    ),
    toStage(
      "leads",
      "Website Leads",
      "Verified submissions",
      "Website form submissions",
      leads,
      true,
      isMulti,
    ),
  ];

  const { conversions, leakStageKey } = buildConversions(stages);
  const headline = buildHeadline(stages, conversions, leakStageKey);
  const bookableCard = buildBookableCandidate(stages, leakStageKey);

  logger.info(
    {
      organizationId: input.organizationId,
      locationId: input.locationId,
      reportMonth: input.reportMonth,
      leakStageKey,
      availableStages: stages
        .filter((stage) => stage.available)
        .map((stage) => stage.key),
    },
    "[patient-journey] assembled funnel",
  );

  return {
    location,
    period,
    stages,
    conversions,
    leakStageKey,
    bookableCard,
    revenue: pms.revenue,
    context: {
      rank: {
        position: rank.position,
        totalCompetitors: rank.totalCompetitors,
        available: rank.available,
        notInTop20: rank.notInTop20,
      },
      reviews: {
        rating: reviews.rating,
        count: reviews.count,
        newThisMonth: reviews.newThisMonth,
        replyRatePct: reviews.replyRatePct,
        available: reviews.available,
        card: memorableCard,
      },
    },
    headline,
  };
}
