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

/**
 * E2 attributed-lift measurement config (spec Rev 2). The real gate on whether a verdict
 * is offered is NOT a fixed impressions floor — it is the minimum-detectable-effect check
 * inside attributionMath, driven by the binomial standard error of the actual counts, so
 * it self-widens as views thin. These are structural minimums + a materiality definition,
 * not tuning knobs. Where a knob is guessed, wrong-conservative widens abstain (fails
 * silent). The customer surface stays dark until these are calibrated against real dev
 * data (see the spec Done blocker).
 */
export const ATTRIBUTION = {
  /**
   * Z multiplier for the noise band. 2.5 is ~1% per-measurement chance false-positive in the
   * normal-approximation middle, but at the 0-click boundary the discreteness pushes the real
   * rate to ~3% (a fat stable page whose post window goes all-zero can cross by luck ~1 in 30)
   * — still far better than Z=2's ~5%, and the fabrication there is anti-flattering (it blames
   * the action). Calibrating this exact rate, and adding a multiple-testing correction for
   * fleet-wide use, is a real-data gate before any customer exposure. The observed change uses
   * the RAW rate; only the error band uses the Agresti–Coull estimate.
   */
  BAND_Z: 2.5,
  /** A CTR move is "material" at ≥ this fraction of the baseline CTR (relative to base rate). */
  MATERIAL_RELATIVE_FRACTION: 0.2,
  /**
   * Absolute materiality floor (proportion), tiny — only guards a ~0 baseline from making
   * everything material. Kept small so a large RELATIVE move at a very low base CTR (common
   * on impression-heavy pages, e.g. 0.25%→0.07%) is not wrongly suppressed; the count-based
   * band, not this floor, is what protects against thin-data noise.
   */
  MATERIAL_ABSOLUTE_MIN: 0.0002,
  /**
   * Minimum settled pre-days to form a baseline. Set to the stationarity minimum so the
   * baseline is ALWAYS trend-checked before ITS runs — a shorter baseline can't be verified
   * stable, so it abstains rather than risk crediting the action for a pre-existing trend.
   */
  MIN_PRE_DAYS: 6,
  /** Structural minimum settled post-days for an after-picture. */
  MIN_POST_DAYS: 3,
  /** Minimum pre-days before the baseline-stationarity check will run (fewer → abstain). */
  MIN_PRE_DAYS_FOR_STATIONARITY: 6,
  /**
   * A control must clear this impressions floor PER WINDOW to be trusted for DiD. Erring
   * high is safe: a control that doesn't qualify just drops DiD to the honest ITS default.
   */
  MIN_CONTROL_IMPRESSIONS: 300,
  /**
   * A control must also carry at least this fraction of the treated set's impressions to be
   * trusted — a scrawny control would flood the DiD error and silence a real treated move.
   */
  CONTROL_MIN_FRACTION_OF_TREATED: 0.5,
  /** Trailing GSC days treated as unsettled (GSC lags ~2 days). */
  UNSETTLED_TRAILING_DAYS: 2,
} as const;

/**
 * The ordinal verdict the measurement returns — never a promised causal number
 * (spec D5). "not_enough_data" is the honest default while the window is still filling.
 */
export const ATTRIBUTION_RUNG = {
  NOT_ENOUGH_DATA: "not_enough_data",
  NO_DETECTABLE_CHANGE: "no_detectable_change",
  TRENDING_UP: "trending_up",
  TRENDING_DOWN: "trending_down",
} as const;

export type AttributionRung =
  (typeof ATTRIBUTION_RUNG)[keyof typeof ATTRIBUTION_RUNG];

export type MetricActionType =
  (typeof METRIC_ACTION_TYPE)[keyof typeof METRIC_ACTION_TYPE];
export type MetricActionSource =
  (typeof METRIC_ACTION_SOURCE)[keyof typeof METRIC_ACTION_SOURCE];
export type MetricActionStage =
  (typeof METRIC_ACTION_STAGE)[keyof typeof METRIC_ACTION_STAGE];
export type MetricActionMetric =
  (typeof METRIC_ACTION_METRIC)[keyof typeof METRIC_ACTION_METRIC];
