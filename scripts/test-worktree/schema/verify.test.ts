import { describe, expect, it } from "vitest";
import {
  validateSchemaBaseline,
  validateSchemaMetadata,
} from "./verify";

const MINIMAL_SCHEMA = `
-- PostgreSQL database dump
CREATE TABLE public.users (id integer);
CREATE TABLE public.organizations (id integer);
CREATE TABLE public.locations (id integer);
CREATE TABLE public.knex_migrations (id integer);
`;

describe("worktree schema baseline verification", () => {
  it("accepts structure-only SQL and migration metadata", () => {
    expect(() => validateSchemaBaseline(MINIMAL_SCHEMA)).not.toThrow();
    expect(() =>
      validateSchemaMetadata({
        schemaVersion: 1,
        source: "alloro-dev",
        generatedAt: "2026-07-17T00:00:00.000Z",
        checkoutHead: "0123456789abcdef",
        appliedMigrations: ["20260701000000_example.ts"],
      }),
    ).not.toThrow();
  });

  it.each([
    ["COPY public.users FROM stdin;", "COPY data statement"],
    ["INSERT INTO users VALUES (1);", "INSERT data statement"],
    ["GRANT SELECT ON users TO someone;", "database privilege statement"],
    ["ALTER TABLE users OWNER TO someone;", "database owner statement"],
    ["SELECT 'person@example.com';", "email-like value"],
  ])("rejects %s", (statement, reason) => {
    expect(() => validateSchemaBaseline(`${MINIMAL_SCHEMA}\n${statement}`)).toThrow(
      reason,
    );
  });
});
