import { describe, expect, it } from "vitest";
import {
  buildMigrationBootstrapSql,
  parsePublishedPort,
} from "./util.migration-bootstrap";

describe("migration bootstrap utilities", () => {
  it("builds migration tracking rows without application data", () => {
    const sql = buildMigrationBootstrapSql({
      schemaVersion: 1,
      source: "alloro-dev",
      generatedAt: "2026-07-17T00:00:00.000Z",
      checkoutHead: "head",
      appliedMigrations: [
        "20260701000000_first.ts",
        "20260702000000_quote's-safe.ts",
      ],
    });

    expect(sql).toContain("20260701000000_first.ts");
    expect(sql).toContain("quote''s-safe.ts");
    expect(sql).not.toContain("ON CONFLICT");
    expect(sql).not.toContain("users");
    expect(sql).not.toContain("organizations");
  });

  it.each([
    ["127.0.0.1:49152", 49152],
    ["[::1]:49153", 49153],
  ])("parses Docker port output %s", (output, expected) => {
    expect(parsePublishedPort(output)).toBe(expected);
  });

  it("rejects malformed and out-of-range ports", () => {
    expect(() => parsePublishedPort("not-a-port")).toThrow("invalid published port");
    expect(() => parsePublishedPort("127.0.0.1:70000")).toThrow("out-of-range");
  });
});
