import {
  METRIC_ACTION_METRIC,
  METRIC_ACTION_SOURCE,
  METRIC_ACTION_STAGE,
  METRIC_ACTION_TYPE,
  METRIC_ACTION_VISIBLE_DAYS,
  type MetricActionMetric,
  type MetricActionType,
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

export interface RecordGbpCompletenessFillInput {
  organizationId: number;
  locationId: number | null;
  projectId: string;
  /** The GBP work-item id — the idempotent source of the fix. */
  workItemId: string;
  /** The completeness fields Alloro filled (e.g. ["hours", "website"]). */
  filledFields: string[];
  occurredAt?: Date;
}

export interface JourneyMetricAction {
  id: string;
  actionType: MetricActionType;
  metricKey: MetricActionMetric;
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

function gbpCompletenessSummary(event: IMetricActionEvent): string {
  const fields = Array.isArray(event.metadata.filled_fields)
    ? (event.metadata.filled_fields as string[])
    : [];
  const label = fields.length ? fields.join(", ") : "profile details";
  // What Alloro did, plainly — no claim it moved the metric (the doctor rule).
  return `Filled in your ${label} on your Google Business Profile.`;
}

function actionSummary(event: IMetricActionEvent): string {
  if (event.action_type === METRIC_ACTION_TYPE.GBP_COMPLETENESS_FILL) {
    return gbpCompletenessSummary(event);
  }
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

function measurementNote(
  activeUntil: Date,
  metricKey: MetricActionMetric
): string {
  const formatted = new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(activeUntil);
  const what =
    metricKey === METRIC_ACTION_METRIC.IMPRESSIONS
      ? "how often you show up on Google"
      : "Google click-through";
  return `Watching ${what} through ${formatted}.`;
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

  static async recordGbpCompletenessFill(
    input: RecordGbpCompletenessFillInput
  ): Promise<IMetricActionEvent | null> {
    if (input.filledFields.length === 0) return null;

    const occurredAt = input.occurredAt || new Date();
    return MetricActionModel.upsertBySource({
      organization_id: input.organizationId,
      location_id: input.locationId,
      project_id: input.projectId,
      action_type: METRIC_ACTION_TYPE.GBP_COMPLETENESS_FILL,
      stage_key: METRIC_ACTION_STAGE.IMPRESSIONS,
      metric_key: METRIC_ACTION_METRIC.IMPRESSIONS,
      source_type: METRIC_ACTION_SOURCE.GBP_BUSINESS_INFO_WRITEBACK,
      source_id: input.workItemId,
      entity_type: "gbp_profile",
      affected_count: input.filledFields.length,
      occurred_at: occurredAt,
      active_until: addVisibleWindow(occurredAt),
      metadata: {
        filled_fields: input.filledFields,
      },
    });
  }

  /**
   * Stop reporting a completeness fill that has been reverted on Google.
   *
   * The note is written in the past tense ("Filled in your website…") and is
   * paired with a "watching how often you show up" line, so leaving it visible
   * after the owner undoes the fill would present an active, watched change that
   * no longer exists. Honesty here is the product: we report what is true now,
   * not what was true when we acted.
   */
  static async expireGbpCompletenessFill(workItemId: string): Promise<number> {
    return MetricActionModel.expireBySource({
      actionType: METRIC_ACTION_TYPE.GBP_COMPLETENESS_FILL,
      sourceType: METRIC_ACTION_SOURCE.GBP_BUSINESS_INFO_WRITEBACK,
      sourceId: workItemId,
      expiredAt: new Date(),
    });
  }

  static async findLatestForJourney(
    input: FindJourneyMetricActionInput
  ): Promise<JourneyMetricAction | null> {
    // No metric filter: the most recent get-found action shows, whether it is a
    // meta update (ctr) or a completeness fill (impressions).
    const event = await MetricActionModel.findLatestActiveForMetric({
      organizationId: input.organizationId,
      locationId: input.locationId,
      projectId: input.projectId,
      stageKey: METRIC_ACTION_STAGE.IMPRESSIONS,
      now: input.now || new Date(),
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
    });
    if (!event) return null;

    return {
      id: event.id,
      actionType: event.action_type,
      metricKey: event.metric_key,
      occurredAt: event.occurred_at.toISOString(),
      activeUntil: event.active_until.toISOString(),
      summary: actionSummary(event),
      measurementNote: measurementNote(event.active_until, event.metric_key),
    };
  }
}
