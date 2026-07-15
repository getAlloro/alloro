import { describe, expect, it } from "vitest";
import type { SubmissionSummary } from "../../../types/leadgen";
import {
  getAssociationLabel,
  getStageDisplay,
  hasPersistedAccountLink,
  isPersistedConversion,
} from "./leadgenSubmissionDisplay.utils";

const BASE_SUBMISSION: SubmissionSummary = {
  id: "synthetic-session",
  email: null,
  domain: null,
  practice_search_string: null,
  audit_id: null,
  audit_status: null,
  user_agent: null,
  final_stage: "landed",
  completed: false,
  abandoned: false,
  first_seen_at: "2026-07-15T00:00:00.000Z",
  last_seen_at: "2026-07-15T00:00:00.000Z",
};

describe("leadgen submission display", () => {
  it("uses the visible-time claim only for valid report activity", () => {
    const display = getStageDisplay({
      ...BASE_SUBMISSION,
      final_stage: "report_engaged_1min",
      data_quality: "valid",
    });

    expect(display.label).toBe("Report Visible for 1+ Min");
    expect(display.tone).toBe("green");
  });

  it("flags report activity without an audit as unverified history", () => {
    const display = getStageDisplay({
      ...BASE_SUBMISSION,
      final_stage: "report_engaged_1min",
      data_quality: "report_without_audit",
    });

    expect(display).toEqual({
      label: "Unverified report activity",
      tone: "red",
    });
  });

  it("keeps derived matches neutral", () => {
    expect(getAssociationLabel("email")).toBe("Existing account email match");
    expect(getAssociationLabel("domain")).toBe("Known organization match");
    expect(getAssociationLabel("persisted")).toBeNull();
    expect(getAssociationLabel(null)).toBeNull();
  });

  it("derives account linkage only from persisted fields", () => {
    expect(
      hasPersistedAccountLink({ ...BASE_SUBMISSION, linked_via: "email" }),
    ).toBe(false);
    expect(hasPersistedAccountLink({ ...BASE_SUBMISSION, user_id: 42 })).toBe(
      true,
    );
    expect(
      hasPersistedAccountLink({
        ...BASE_SUBMISSION,
        converted_at: "2026-07-15T00:01:00.000Z",
      }),
    ).toBe(true);
  });

  it("derives conversion only from converted_at", () => {
    expect(isPersistedConversion({ ...BASE_SUBMISSION, completed: true })).toBe(
      false,
    );
    expect(isPersistedConversion({ ...BASE_SUBMISSION, user_id: 42 })).toBe(
      false,
    );
    expect(
      isPersistedConversion({
        ...BASE_SUBMISSION,
        converted_at: "2026-07-15T00:01:00.000Z",
      }),
    ).toBe(true);
  });
});
