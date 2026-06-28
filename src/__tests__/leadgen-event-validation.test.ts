import { describe, it, expect } from "vitest";
import {
  isAcceptedEventName,
  isProgressionStage,
} from "../controllers/leadgen-tracking/feature-utils/util.event-ordering";

/**
 * The /leadgen/event boundary gate must accept every event the leadgen-tool
 * fires (progression stages + non-stage interaction events) while still
 * rejecting unknown names. Regression guard for the 400 that silently dropped
 * CTA / email-field / retry events.
 *
 * FE union mirror — keep in sync with leadgen-tool src/lib/tracking.ts.
 */
const FRONTEND_EVENT_NAMES = [
  "landed",
  "input_started",
  "input_submitted",
  "audit_started",
  "audit_retried",
  "stage_viewed_1",
  "stage_viewed_2",
  "stage_viewed_3",
  "stage_viewed_4",
  "stage_viewed_5",
  "email_gate_shown",
  "email_field_focused",
  "email_field_blurred_empty",
  "email_submitted",
  "results_viewed",
  "report_engaged_1min",
  "cta_clicked_create_account",
  "cta_clicked_strategy_call",
] as const;

// The five that used to 400 (not in STAGE_ORDER): interaction + retry events.
const INTERACTION_EVENTS = [
  "audit_retried",
  "cta_clicked_create_account",
  "cta_clicked_strategy_call",
  "email_field_focused",
  "email_field_blurred_empty",
] as const;

describe("isAcceptedEventName — /event boundary gate", () => {
  it("accepts every event name the frontend fires (FE union ⊆ accepted set)", () => {
    for (const name of FRONTEND_EVENT_NAMES) {
      expect(isAcceptedEventName(name), `expected "${name}" to be accepted`).toBe(
        true
      );
    }
  });

  it("rejects unknown event names", () => {
    expect(isAcceptedEventName("totally_made_up")).toBe(false);
    expect(isAcceptedEventName("")).toBe(false);
  });

  it("rejects inherited Object members (no prototype-chain leak)", () => {
    expect(isAcceptedEventName("toString")).toBe(false);
    expect(isAcceptedEventName("constructor")).toBe(false);
    expect(isAcceptedEventName("hasOwnProperty")).toBe(false);
  });

  it("rejects non-string values", () => {
    expect(isAcceptedEventName(null)).toBe(false);
    expect(isAcceptedEventName(undefined)).toBe(false);
    expect(isAcceptedEventName(123)).toBe(false);
    expect(isAcceptedEventName({})).toBe(false);
  });
});

describe("isProgressionStage — interaction events never advance the funnel", () => {
  it("treats the five interaction/retry events as non-stage", () => {
    for (const name of INTERACTION_EVENTS) {
      expect(isProgressionStage(name), `"${name}" should be non-stage`).toBe(
        false
      );
    }
  });

  it("treats real funnel events as progression stages", () => {
    for (const name of ["landed", "audit_started", "results_viewed", "stage_viewed_3"]) {
      expect(isProgressionStage(name), `"${name}" should be a stage`).toBe(true);
    }
  });

  it("treats 'abandoned' and inherited members as non-stage", () => {
    expect(isProgressionStage("abandoned")).toBe(false);
    expect(isProgressionStage("toString")).toBe(false);
  });
});
