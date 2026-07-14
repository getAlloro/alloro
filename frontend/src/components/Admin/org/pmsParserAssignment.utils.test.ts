import { describe, expect, it } from "vitest";
import {
  getPmsParserAssignmentFromSelectValue,
  getPmsParserSelectValue,
} from "./pmsParserAssignment.utils";

describe("PMS parser assignment select boundary", () => {
  it("renders null and the legacy default assignment as configurable default", () => {
    expect(getPmsParserSelectValue(null)).toBe("");
    expect(getPmsParserSelectValue("default")).toBe("");
  });

  it("renders DentalEMR as the custom parser option", () => {
    expect(getPmsParserSelectValue("dentalemr")).toBe("dentalemr");
  });

  it("converts the empty DOM option value to a null assignment", () => {
    expect(getPmsParserAssignmentFromSelectValue("")).toBeNull();
  });

  it("converts the DentalEMR DOM option value to its assignment", () => {
    expect(getPmsParserAssignmentFromSelectValue("dentalemr")).toBe(
      "dentalemr",
    );
  });
});
