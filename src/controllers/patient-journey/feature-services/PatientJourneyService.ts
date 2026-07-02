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
    const wholePractice = "Whole-practice website total.";
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
  const isMulti = location.isMultiLocation;
  const isCurrentMonth = isCurrentUtcMonth(input.reportMonth);

  const emptyRead: StageRead = { value: null, available: false, asOf: null };

  // Website-traffic stages need a project; per-location stages do not.
  const [impressions, visits, leads, pms, rank, reviews] =
    await Promise.all([
      projectId
        ? readImpressions(
            projectId,
            period.startDate,
            period.endDate,
            isCurrentMonth,
          )
        : Promise.resolve(emptyRead),
      projectId
        ? readVisits(projectId, period.startDate, period.endDate)
        : Promise.resolve(emptyRead),
      projectId
        ? readLeads(projectId, monthStart, monthEnd)
        : Promise.resolve(emptyRead),
      readPms(input.organizationId, input.locationId),
      readRank(input.organizationId, input.locationId),
      readReviews(input.locationId, monthStart, monthEnd),
    ]);

  const stages: PatientJourneyStage[] = [
    toStage(
      "impressions",
      "Google Visibility",
      "Google search impressions",
      "Google Search Console",
      impressions,
      true,
      isMulti,
    ),
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
    revenue: pms.revenue,
    context: {
      rank: {
        position: rank.position,
        totalCompetitors: rank.totalCompetitors,
        available: rank.available,
      },
      reviews: {
        rating: reviews.rating,
        count: reviews.count,
        newThisMonth: reviews.newThisMonth,
        replyRatePct: reviews.replyRatePct,
        available: reviews.available,
      },
    },
    headline,
  };
}
