import {
  METRIC_ACTION_METRIC,
  METRIC_ACTION_SOURCE,
  METRIC_ACTION_STAGE,
  METRIC_ACTION_TYPE,
  METRIC_ACTION_VISIBLE_DAYS,
} from "../config/metricActions";
import {
  MetricActionModel,
  type IMetricActionEvent,
} from "../models/MetricActionModel";

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

export interface SeoMetadataChange {
  titleChanged: boolean;
  descriptionChanged: boolean;
}

export interface RecordSeoBulkUpdateInput {
  organizationId: number;
  locationId: number | null;
  projectId: string;
  jobId: string;
  entityType: "page" | "post";
  affectedCount: number;
  titleChangeCount: number;
  descriptionChangeCount: number;
  failedCount: number;
  occurredAt?: Date;
}

export interface JourneyMetricAction {
  id: string;
  actionType: "seo_meta_update";
  metricKey: "ctr";
  occurredAt: string;
  activeUntil: string;
  summary: string;
  measurementNote: string;
}

export interface FindJourneyMetricActionInput {
  organizationId: number;
  locationId: number | null;
  projectId: string;
  periodStart: Date;
  periodEnd: Date;
  now?: Date;
}

function readSeoValue(value: unknown, key: string): string | null {
  let data = value;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data) as unknown;
    } catch {
      return null;
    }
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const field = (data as Record<string, unknown>)[key];
  return typeof field === "string" ? field.trim() : null;
}

function addVisibleWindow(date: Date): Date {
  return new Date(date.getTime() + METRIC_ACTION_VISIBLE_DAYS * MILLISECONDS_PER_DAY);
}

function entityLabel(entityType: string | null, count: number): string {
  const singular = entityType === "post" ? "post" : entityType === "page" ? "page" : "item";
  return count === 1 ? singular : `${singular}s`;
}

function actionSummary(event: IMetricActionEvent): string {
  const titleCount = Number(event.metadata.title_change_count || 0);
  const descriptionCount = Number(event.metadata.description_change_count || 0);
  const changed = titleCount > 0 && descriptionCount > 0
    ? "titles and descriptions"
    : descriptionCount > 0
      ? "descriptions"
      : "titles";
  return `Updated Google search ${changed} on ${event.affected_count} ${entityLabel(
    event.entity_type,
    event.affected_count
  )}.`;
}

function measurementNote(activeUntil: Date): string {
  const formatted = new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(activeUntil);
  return `Watching Google click-through through ${formatted}.`;
}

export class MetricActionService {
  static detectSeoMetadataChange(
    previousSeoData: unknown,
    nextSeoData: unknown
  ): SeoMetadataChange {
    return {
      titleChanged:
        readSeoValue(previousSeoData, "meta_title") !==
        readSeoValue(nextSeoData, "meta_title"),
      descriptionChanged:
        readSeoValue(previousSeoData, "meta_description") !==
        readSeoValue(nextSeoData, "meta_description"),
    };
  }

  static async recordSeoBulkUpdate(
    input: RecordSeoBulkUpdateInput
  ): Promise<IMetricActionEvent | null> {
    if (input.affectedCount <= 0) return null;

    const occurredAt = input.occurredAt || new Date();
    return MetricActionModel.upsertBySource({
      organization_id: input.organizationId,
      location_id: input.locationId,
      project_id: input.projectId,
      action_type: METRIC_ACTION_TYPE.SEO_META_UPDATE,
      stage_key: METRIC_ACTION_STAGE.IMPRESSIONS,
      metric_key: METRIC_ACTION_METRIC.CLICK_THROUGH_RATE,
      source_type: METRIC_ACTION_SOURCE.SEO_BULK_GENERATION_JOB,
      source_id: input.jobId,
      entity_type: input.entityType,
      affected_count: input.affectedCount,
      occurred_at: occurredAt,
      active_until: addVisibleWindow(occurredAt),
      metadata: {
        title_change_count: input.titleChangeCount,
        description_change_count: input.descriptionChangeCount,
        failed_count: input.failedCount,
      },
    });
  }

  static async findLatestForJourney(
    input: FindJourneyMetricActionInput
  ): Promise<JourneyMetricAction | null> {
    const event = await MetricActionModel.findLatestActiveForMetric({
      organizationId: input.organizationId,
      locationId: input.locationId,
      projectId: input.projectId,
      stageKey: METRIC_ACTION_STAGE.IMPRESSIONS,
      metricKey: METRIC_ACTION_METRIC.CLICK_THROUGH_RATE,
      now: input.now || new Date(),
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
    });
    if (!event) return null;

    return {
      id: event.id,
      actionType: METRIC_ACTION_TYPE.SEO_META_UPDATE,
      metricKey: METRIC_ACTION_METRIC.CLICK_THROUGH_RATE,
      occurredAt: event.occurred_at.toISOString(),
      activeUntil: event.active_until.toISOString(),
      summary: actionSummary(event),
      measurementNote: measurementNote(event.active_until),
    };
  }
}
