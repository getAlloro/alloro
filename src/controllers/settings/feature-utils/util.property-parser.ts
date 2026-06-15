import logger from "../../../lib/logger";

export interface PropertyIds {
  gbp: any[];
}

const DEFAULT_PROPERTIES: PropertyIds = { gbp: [] };

export function parsePropertyIds(
  raw: string | Record<string, unknown> | null | undefined
): PropertyIds {
  if (!raw) {
    return { ...DEFAULT_PROPERTIES };
  }

  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch (e) {
      logger.error({ err: e }, "Error parsing property IDs:");
      return { ...DEFAULT_PROPERTIES };
    }
  }

  return raw as unknown as PropertyIds;
}

export function updatePropertyByType(
  currentProperties: PropertyIds,
  type: string,
  data: any,
  action: string
): PropertyIds {
  const updated = { ...currentProperties };

  if (type === "gbp") {
    if (action === "connect") {
      updated.gbp = data;
    } else {
      updated.gbp = [];
    }
  }

  return updated;
}
