import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IMetricActionEvent } from "../models/MetricActionModel";

type Row = IMetricActionEvent;
type Predicate = (row: Row) => boolean;

let rows: Row[] = [];
let nextId = 1;

function valueOf(row: Row, column: string): unknown {
  return (row as unknown as Record<string, unknown>)[column];
}

function compare(actual: unknown, operator: string, expected: unknown): boolean {
  const left = actual instanceof Date ? actual.getTime() : actual;
  const right = expected instanceof Date ? expected.getTime() : expected;
  if (operator === ">=") return Number(left) >= Number(right);
  if (operator === ">") return Number(left) > Number(right);
  if (operator === "<") return Number(left) < Number(right);
  return left === right;
}

function makeQueryBuilder(): Record<string, unknown> {
  const filters: Predicate[] = [];
  let insertPayload: Record<string, unknown> | null = null;
  let resolvedInsert: Row[] = [];

  const builder: Record<string, unknown> = {};
  builder.where = vi.fn((arg1: unknown, arg2?: unknown, arg3?: unknown) => {
    if (typeof arg1 === "function") {
      const alternatives: Predicate[] = [];
      const group = {
        whereNull: (column: string) => {
          alternatives.push((row: Row) => valueOf(row, column) === null);
          return group;
        },
        orWhere: (column: string, expected: unknown) => {
          alternatives.push((row: Row) => valueOf(row, column) === expected);
          return group;
        },
      };
      arg1.call(group, group);
      filters.push((row) => alternatives.some((predicate) => predicate(row)));
    } else if (typeof arg1 === "object" && arg1 !== null) {
      const conditions = arg1 as Record<string, unknown>;
      filters.push((row) =>
        Object.entries(conditions).every(
          ([column, expected]) => valueOf(row, column) === expected
        )
      );
    } else {
      filters.push((row) => compare(valueOf(row, String(arg1)), String(arg2), arg3));
    }
    return builder;
  });
  builder.whereNull = vi.fn((column: string) => {
    filters.push((row) => valueOf(row, column) === null);
    return builder;
  });
  builder.orderBy = vi.fn(() => builder);
  builder.limit = vi.fn(() => builder);
  builder.first = vi.fn(() => Promise.resolve(rows.filter((row) => filters.every((f) => f(row)))[0]));
  builder.insert = vi.fn((payload: Record<string, unknown>) => {
    insertPayload = payload;
    return builder;
  });
  builder.onConflict = vi.fn(() => builder);
  builder.merge = vi.fn((payload: Record<string, unknown>) => {
    if (!insertPayload) return builder;
    const existing = rows.find(
      (row) =>
        row.action_type === insertPayload?.action_type &&
        row.source_type === insertPayload?.source_type &&
        row.source_id === insertPayload?.source_id
    );
    if (existing) {
      Object.assign(existing, payload);
      resolvedInsert = [existing];
    } else {
      const row = {
        ...insertPayload,
        id: `event-${nextId++}`,
      } as unknown as Row;
      rows.push(row);
      resolvedInsert = [row];
    }
    return builder;
  });
  builder.returning = vi.fn(() => Promise.resolve(resolvedInsert));
  return builder;
}

vi.mock("../database/connection", () => ({
  db: vi.fn(() => makeQueryBuilder()),
}));

import { MetricActionModel } from "../models/MetricActionModel";

function makeRow(overrides: Partial<Row>): Row {
  return {
    id: overrides.id || `event-${nextId++}`,
    organization_id: overrides.organization_id || 1,
    location_id: overrides.location_id ?? null,
    project_id: overrides.project_id || "project-1",
    action_type: "seo_meta_update",
    stage_key: "impressions",
    metric_key: "ctr",
    source_type: "seo_bulk_generation_job",
    source_id: overrides.source_id || "job-1",
    entity_type: overrides.entity_type || "page",
    affected_count: overrides.affected_count || 1,
    occurred_at: overrides.occurred_at || new Date("2026-07-15T00:00:00.000Z"),
    active_until: overrides.active_until || new Date("2026-08-14T00:00:00.000Z"),
    metadata: overrides.metadata || {},
    created_at: overrides.created_at || new Date("2026-07-15T00:00:00.000Z"),
    updated_at: overrides.updated_at || new Date("2026-07-15T00:00:00.000Z"),
  };
}

beforeEach(() => {
  rows = [];
  nextId = 1;
  vi.clearAllMocks();
});

describe("MetricActionModel", () => {
  it("upserts the same source job idempotently", async () => {
    const base = makeRow({ id: undefined });
    const input = {
      organization_id: base.organization_id,
      location_id: base.location_id,
      project_id: base.project_id,
      action_type: base.action_type,
      stage_key: base.stage_key,
      metric_key: base.metric_key,
      source_type: base.source_type,
      source_id: base.source_id,
      entity_type: base.entity_type,
      affected_count: base.affected_count,
      occurred_at: base.occurred_at,
      active_until: base.active_until,
      metadata: base.metadata,
    };

    await MetricActionModel.upsertBySource(input);
    await MetricActionModel.upsertBySource({ ...input, affected_count: 3 });

    expect(rows).toHaveLength(1);
    expect(rows[0].affected_count).toBe(3);
  });

  it("returns an organization-wide event for the matching tenant and project only", async () => {
    rows = [
      makeRow({ id: "right", organization_id: 10, project_id: "project-a", location_id: null }),
      makeRow({ id: "wrong-org", organization_id: 11, project_id: "project-a", location_id: null }),
      makeRow({ id: "wrong-project", organization_id: 10, project_id: "project-b", location_id: null }),
    ];

    const result = await MetricActionModel.findLatestActiveForMetric({
      organizationId: 10,
      locationId: 20,
      projectId: "project-a",
      stageKey: "impressions",
      metricKey: "ctr",
      now: new Date("2026-07-20T00:00:00.000Z"),
      periodStart: new Date("2026-07-01T00:00:00.000Z"),
      periodEnd: new Date("2026-08-01T00:00:00.000Z"),
    });

    expect(result?.id).toBe("right");
  });

  it("excludes expired and out-of-period events", async () => {
    rows = [
      makeRow({
        id: "expired",
        occurred_at: new Date("2026-06-01T00:00:00.000Z"),
        active_until: new Date("2026-07-01T00:00:00.000Z"),
      }),
    ];

    const result = await MetricActionModel.findLatestActiveForMetric({
      organizationId: 1,
      locationId: null,
      projectId: "project-1",
      stageKey: "impressions",
      metricKey: "ctr",
      now: new Date("2026-07-20T00:00:00.000Z"),
      periodStart: new Date("2026-07-01T00:00:00.000Z"),
      periodEnd: new Date("2026-08-01T00:00:00.000Z"),
    });

    expect(result).toBeNull();
  });
});
