import type {
  PmsParserAssignment,
  PmsParserType,
} from "../../../api/admin-organizations";

export type PmsParserSelectValue = "" | Exclude<PmsParserType, "default">;

export function getPmsParserSelectValue(
  pmsType: PmsParserAssignment,
): PmsParserSelectValue {
  return pmsType === "dentalemr" ? "dentalemr" : "";
}

export function getPmsParserAssignmentFromSelectValue(
  selectValue: string,
): PmsParserAssignment {
  return selectValue === "dentalemr" ? "dentalemr" : null;
}
