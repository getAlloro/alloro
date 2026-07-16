import { BaseModel, QueryContext } from "./BaseModel";

/**
 * AI-Answer Visibility (AEO) observation — Alloro Funnel Engine A3.
 * A LOG: one row per (location, prompt, engine, run_date). `position` is stored
 * raw for analysis and is NEVER surfaced as a rank. `engine`/`capture_method`
 * are DB-CHECK-constrained strings (the strict unions live in the service layer,
 * so the model imports no service type).
 */

export interface IAiVisibilityObservation {
  id: string;
  organization_id: number;
  location_id: number;
  engine: string;
  capture_method: string;
  prompt_key: string;
  prompt_text: string;
  mentioned: boolean;
  cited: boolean;
  cited_source: string | null;
  position: number | null;
  raw_excerpt: string;
  run_date: string;
  observed_at: Date;
  created_at: Date;
  updated_at: Date;
}

export interface RecordObservationInput {
  organizationId: number;
  locationId: number;
  engine: string;
  captureMethod: string;
  promptKey: string;
  promptText: string;
  mentioned: boolean;
  cited: boolean;
  citedSource: string | null;
  position: number | null;
  rawExcerpt: string;
  /** "YYYY-MM-DD" — the run day, part of the idempotency key. */
  runDate: string;
  observedAt: Date;
}

export class AiVisibilityObservationModel extends BaseModel {
  protected static tableName = "ai_visibility_observation";

  /**
   * Idempotent insert: a second write for the same (location, prompt, engine,
   * run_date) is ignored (no duplicate observation, no error). A log, not a score.
   */
  static async record(
    input: RecordObservationInput,
    trx?: QueryContext
  ): Promise<void> {
    await this.table(trx)
      .insert({
        organization_id: input.organizationId,
        location_id: input.locationId,
        engine: input.engine,
        capture_method: input.captureMethod,
        prompt_key: input.promptKey,
        prompt_text: input.promptText,
        mentioned: input.mentioned,
        cited: input.cited,
        cited_source: input.citedSource,
        position: input.position,
        raw_excerpt: input.rawExcerpt,
        run_date: input.runDate,
        observed_at: input.observedAt,
      })
      .onConflict(["location_id", "prompt_key", "engine", "run_date"])
      .ignore();
  }

  /**
   * Tenant-scoped read (§11.7): organizationId is a REQUIRED argument and the
   * query filters by BOTH organization and location, so one tenant can never
   * read another's observations even if a location_id is guessed or reused.
   */
  static async listForLocation(
    organizationId: number,
    locationId: number,
    limit = 100,
    trx?: QueryContext
  ): Promise<IAiVisibilityObservation[]> {
    return this.table(trx)
      .where({ organization_id: organizationId, location_id: locationId })
      .orderBy("observed_at", "desc")
      .limit(limit);
  }
}
