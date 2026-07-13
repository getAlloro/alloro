import logger from "../lib/logger";

export const PMS_PARSER_TYPES = ["default", "dentalemr"] as const;

export type PmsParserType = (typeof PMS_PARSER_TYPES)[number];

export interface PmsParserDefinition {
  type: PmsParserType;
  label: string;
}

export const PMS_PARSER_REGISTRY: readonly PmsParserDefinition[] = [
  { type: "default", label: "Default" },
  { type: "dentalemr", label: "DentalEMR" },
];

export function isPmsParserType(value: unknown): value is PmsParserType {
  return typeof value === "string" && PMS_PARSER_TYPES.some((type) => type === value);
}

export function resolvePmsParserType(
  value: string | null | undefined,
  organizationId?: number
): PmsParserType {
  if (isPmsParserType(value)) return value;

  if (value) {
    logger.warn(
      { organizationId },
      "Unknown organization PMS parser type; using the default parser."
    );
  }

  return "default";
}
