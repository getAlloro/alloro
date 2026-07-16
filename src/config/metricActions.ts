export const METRIC_ACTION_TYPE = {
  SEO_META_UPDATE: "seo_meta_update",
} as const;

export const METRIC_ACTION_SOURCE = {
  SEO_BULK_GENERATION_JOB: "seo_bulk_generation_job",
} as const;

export const METRIC_ACTION_STAGE = {
  IMPRESSIONS: "impressions",
} as const;

export const METRIC_ACTION_METRIC = {
  CLICK_THROUGH_RATE: "ctr",
} as const;

export const METRIC_ACTION_VISIBLE_DAYS = 30;
export const METRIC_ACTION_DISPLAY_LIMIT = 1;

export type MetricActionType =
  (typeof METRIC_ACTION_TYPE)[keyof typeof METRIC_ACTION_TYPE];
export type MetricActionSource =
  (typeof METRIC_ACTION_SOURCE)[keyof typeof METRIC_ACTION_SOURCE];
export type MetricActionStage =
  (typeof METRIC_ACTION_STAGE)[keyof typeof METRIC_ACTION_STAGE];
export type MetricActionMetric =
  (typeof METRIC_ACTION_METRIC)[keyof typeof METRIC_ACTION_METRIC];
