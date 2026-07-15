import { BaseModel, QueryContext } from "./BaseModel";
import type {
  MetricActionMetric,
  MetricActionSource,
  MetricActionStage,
  MetricActionType,
} from "../config/metricActions";
import { METRIC_ACTION_DISPLAY_LIMIT } from "../config/metricActions";

export interface IMetricActionEvent {
  id: string;
  organization_id: number;
  location_id: number | null;
  project_id: string | null;
  action_type: MetricActionType;
  stage_key: MetricActionStage;
  metric_key: MetricActionMetric;
  source_type: MetricActionSource;
  source_id: string;
  entity_type: string | null;
  affected_count: number;
  occurred_at: Date;
  active_until: Date;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export type MetricActionEventInput = Omit<
  IMetricActionEvent,
  "id" | "created_at" | "updated_at"
>;

export interface ActiveMetricActionQuery {
  organizationId: number;
  locationId: number | null;
  projectId: string;
  stageKey: MetricActionStage;
  metricKey: MetricActionMetric;
  now: Date;
  periodStart: Date;
  periodEnd: Date;
}

export class MetricActionModel extends BaseModel {
  protected static tableName = "metric_action_events";
  protected static jsonFields = ["metadata"];

  static async upsertBySource(
    data: MetricActionEventInput,
    trx?: QueryContext
  ): Promise<IMetricActionEvent> {
    const now = new Date();
    const serialized = this.serializeJsonFields({
      ...data,
      updated_at: now,
    });

    const [row] = await this.table(trx)
      .insert({ ...serialized, created_at: now })
      .onConflict(["action_type", "source_type", "source_id"])
      .merge(serialized)
      .returning("*");

    return this.deserializeJsonFields(row) as IMetricActionEvent;
  }

  static async findLatestActiveForMetric(
    params: ActiveMetricActionQuery,
    trx?: QueryContext
  ): Promise<IMetricActionEvent | null> {
    const query = this.table(trx)
      .where({
        organization_id: params.organizationId,
        project_id: params.projectId,
        stage_key: params.stageKey,
        metric_key: params.metricKey,
      })
      .where("active_until", ">=", params.now)
      .where("occurred_at", "<", params.periodEnd)
      .where("active_until", ">", params.periodStart);

    if (params.locationId === null) {
      query.whereNull("location_id");
    } else {
      query.where((locationScope) => {
        locationScope
          .whereNull("location_id")
          .orWhere("location_id", params.locationId);
      });
    }

    const row = await query
      .orderBy("occurred_at", "desc")
      .limit(METRIC_ACTION_DISPLAY_LIMIT)
      .first();
    return row
      ? (this.deserializeJsonFields(row) as IMetricActionEvent)
      : null;
  }
}
