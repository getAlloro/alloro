import { describe, expect, it, vi } from "vitest";

vi.mock("../lib/logger", () => ({
  default: { warn: vi.fn() },
}));

import logger from "../lib/logger";
import {
  PMS_PARSER_TYPES,
  isPmsParserType,
  normalizePmsParserAssignment,
  resolvePmsParserType,
} from "../config/pmsParserRegistry";

describe("PMS parser registry", () => {
  it("exposes only the supported server parser types", () => {
    expect(PMS_PARSER_TYPES).toEqual(["default", "dentalemr"]);
    expect(isPmsParserType("default")).toBe(true);
    expect(isPmsParserType("dentalemr")).toBe(true);
    expect(isPmsParserType("auto-detect")).toBe(false);
  });

  it("falls back safely for null and unknown stored values", () => {
    expect(resolvePmsParserType(null, 7)).toBe("default");
    expect(resolvePmsParserType("future-parser", 7)).toBe("default");
    expect(logger.warn).toHaveBeenCalledWith(
      { organizationId: 7 },
      "Unknown organization PMS parser type; using the default parser."
    );
  });

  it("normalizes configurable-default assignments before storage", () => {
    expect(normalizePmsParserAssignment(null)).toBeNull();
    expect(normalizePmsParserAssignment("default")).toBeNull();
    expect(normalizePmsParserAssignment("dentalemr")).toBe("dentalemr");
  });
});
