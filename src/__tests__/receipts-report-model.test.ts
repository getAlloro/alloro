/**
 * Unit tests for ReceiptsReportModel.
 *
 * The in-memory Knex-shaped evaluator applies the model's real predicates,
 * joins, grouping, and ordering. This proves tenant and period isolation
 * without a live database or production data (§20.2/§20.4).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
type Predicate = (row: Row) => boolean;
type WhereArguments =
  | [column: string, value: unknown]
  | [column: string, operator: string, value: unknown];

interface LocationFixture {
  id: number;
  organization_id: number;
  name: string;
  status: string;
}

interface ProjectFixture {
  id: string;
  organization_id: number;
}

interface FormSubmissionFixture {
  id: string;
  project_id: string;
  submitted_at: Date;
}

interface WorkItemFixture {
  id: string;
  organization_id: number;
  location_id: number;
  content_type: "local_post" | "review_reply";
  status: string;
  published_at: Date | null;
  created_at: Date;
}

interface RankingFixture {
  id: number;
  organization_id: number;
  location_id: number | null;
  status: string;
  search_status: string | null;
  search_position: number | null;
  search_query: string | null;
  search_results: unknown;
  search_checked_at: Date | null;
  search_position_source: string | null;
  observed_at: Date;
}

interface Fixtures {
  locations: LocationFixture[];
  projects: ProjectFixture[];
  formSubmissions: FormSubmissionFixture[];
  workItems: WorkItemFixture[];
  rankings: RankingFixture[];
}

interface JoinClause {
  table: string;
  leftColumn: string;
  rightColumn: string;
}

interface OrderClause {
  column: string;
  direction: "asc" | "desc";
}

interface TestQueryBuilder {
  where(...args: WhereArguments): TestQueryBuilder;
  andWhere(...args: WhereArguments): TestQueryBuilder;
  whereIn(column: string, values: readonly unknown[]): TestQueryBuilder;
  whereNotNull(column: string): TestQueryBuilder;
  innerJoin(
    table: string,
    leftColumn: string,
    rightColumn: string
  ): TestQueryBuilder;
  groupBy(...columns: string[]): TestQueryBuilder;
  select(...columns: string[]): TestQueryBuilder;
  count(mapping: Record<string, string>): TestQueryBuilder;
  orderBy(column: string, direction?: "asc" | "desc"): TestQueryBuilder;
  first(): TestQueryBuilder;
  then(
    onFulfilled: (value: unknown) => unknown,
    onRejected?: (reason: unknown) => unknown
  ): Promise<unknown>;
}

const START_AT = new Date("2026-07-01T00:00:00.000Z");
const END_EXCLUSIVE_AT = new Date("2026-08-01T00:00:00.000Z");

let fixtures: Fixtures;
let failingTables: Set<string>;

function emptyFixtures(): Fixtures {
  return {
    locations: [],
    projects: [],
    formSubmissions: [],
    workItems: [],
    rankings: [],
  };
}

function toRow(value: object): Row {
  return Object.fromEntries(Object.entries(value));
}

function parseTable(table: string): { baseTable: string; alias: string } {
  const match = table.match(/^(.+?)\s+as\s+(\w+)$/i);
  if (!match) return { baseTable: table, alias: table };
  return { baseTable: match[1], alias: match[2] };
}

function qualify(value: object, alias: string, includePlain: boolean): Row {
  const source = toRow(value);
  const qualified: Row = includePlain ? { ...source } : {};
  for (const [key, entry] of Object.entries(source)) {
    qualified[`${alias}.${key}`] = entry;
  }
  return qualified;
}

function rowsForTable(table: string, includePlain = true): Row[] {
  const { baseTable, alias } = parseTable(table);
  let values: object[];
  switch (baseTable) {
    case "locations":
      values = fixtures.locations;
      break;
    case "website_builder.projects":
      values = fixtures.projects;
      break;
    case "website_builder.form_submissions":
      values = fixtures.formSubmissions;
      break;
    case "gbp_work_items":
      values = fixtures.workItems;
      break;
    case "practice_rankings":
      values = fixtures.rankings;
      break;
    default:
      values = [];
  }
  return values.map((value) => qualify(value, alias, includePlain));
}

function unqualified(column: string): string {
  const parts = column.split(".");
  return parts[parts.length - 1] ?? column;
}

function valueAt(row: Row, column: string): unknown {
  return column in row ? row[column] : row[unqualified(column)];
}

function comparable(value: unknown): unknown {
  return value instanceof Date ? value.getTime() : value;
}

function valuesEqual(left: unknown, right: unknown): boolean {
  return comparable(left) === comparable(right);
}

function matchesComparison(
  left: unknown,
  operator: string,
  right: unknown
): boolean {
  const comparableLeft = comparable(left);
  const comparableRight = comparable(right);
  if (operator === "=") return comparableLeft === comparableRight;
  if (
    (typeof comparableLeft !== "number" && typeof comparableLeft !== "string") ||
    (typeof comparableRight !== "number" && typeof comparableRight !== "string")
  ) {
    return false;
  }
  if (operator === ">=") return comparableLeft >= comparableRight;
  if (operator === "<") return comparableLeft < comparableRight;
  throw new Error(`Unsupported test operator: ${operator}`);
}

function compareForOrder(left: unknown, right: unknown): number {
  const comparableLeft = comparable(left);
  const comparableRight = comparable(right);
  if (comparableLeft === comparableRight) return 0;
  if (comparableLeft === null || comparableLeft === undefined) return -1;
  if (comparableRight === null || comparableRight === undefined) return 1;
  if (typeof comparableLeft === "number" && typeof comparableRight === "number") {
    return comparableLeft - comparableRight;
  }
  return String(comparableLeft).localeCompare(String(comparableRight));
}

function makeQueryBuilder(table: string): TestQueryBuilder {
  const { baseTable } = parseTable(table);
  const predicates: Predicate[] = [];
  const joins: JoinClause[] = [];
  const groupColumns: string[] = [];
  const selectedColumns: string[] = [];
  const orderClauses: OrderClause[] = [];
  let countAlias: string | null = null;
  let returnsFirst = false;

  const addWhere = (args: WhereArguments): void => {
    const [column, second, third] = args;
    const operator = args.length === 2 ? "=" : String(second);
    const expected = args.length === 2 ? second : third;
    predicates.push((row) =>
      matchesComparison(valueAt(row, column), operator, expected)
    );
  };

  const evaluate = (): unknown => {
    if (failingTables.has(baseTable)) {
      throw new Error(`synthetic ${baseTable} failure`);
    }

    let rows = rowsForTable(table);
    for (const join of joins) {
      const joinedRows = rowsForTable(join.table, false);
      rows = rows.flatMap((leftRow) =>
        joinedRows
          .filter((rightRow) =>
            valuesEqual(
              valueAt(leftRow, join.leftColumn),
              valueAt(rightRow, join.rightColumn)
            )
          )
          .map((rightRow) => ({ ...leftRow, ...rightRow }))
      );
    }

    rows = rows.filter((row) => predicates.every((predicate) => predicate(row)));

    let output: Row[];
    if (countAlias !== null && groupColumns.length > 0) {
      const groups = new Map<string, { exemplar: Row; count: number }>();
      for (const row of rows) {
        const key = JSON.stringify(
          groupColumns.map((column) => comparable(valueAt(row, column)))
        );
        const group = groups.get(key);
        if (group) group.count += 1;
        else groups.set(key, { exemplar: row, count: 1 });
      }
      output = [...groups.values()].map(({ exemplar, count }) => {
        const row: Row = { [countAlias as string]: String(count) };
        for (const column of groupColumns) {
          row[unqualified(column)] = valueAt(exemplar, column);
        }
        return row;
      });
    } else if (countAlias !== null) {
      output = [{ [countAlias]: String(rows.length) }];
    } else {
      output = rows;
    }

    output.sort((left, right) => {
      for (const clause of orderClauses) {
        const compared = compareForOrder(
          valueAt(left, clause.column),
          valueAt(right, clause.column)
        );
        if (compared !== 0) return clause.direction === "asc" ? compared : -compared;
      }
      return 0;
    });

    if (selectedColumns.length > 0 && countAlias === null) {
      output = output.map((source) => {
        const projected: Row = {};
        for (const column of selectedColumns) {
          projected[unqualified(column)] = valueAt(source, column);
        }
        return projected;
      });
    }

    return returnsFirst ? output[0] : output;
  };

  const builder: TestQueryBuilder = {
    where(...args) {
      addWhere(args);
      return builder;
    },
    andWhere(...args) {
      addWhere(args);
      return builder;
    },
    whereIn(column, values) {
      predicates.push((row) =>
        values.some((value) => valuesEqual(valueAt(row, column), value))
      );
      return builder;
    },
    whereNotNull(column) {
      predicates.push((row) => valueAt(row, column) !== null && valueAt(row, column) !== undefined);
      return builder;
    },
    innerJoin(joinTable, leftColumn, rightColumn) {
      joins.push({ table: joinTable, leftColumn, rightColumn });
      return builder;
    },
    groupBy(...columns) {
      groupColumns.push(...columns);
      return builder;
    },
    select(...columns) {
      selectedColumns.push(...columns);
      return builder;
    },
    count(mapping) {
      countAlias = Object.keys(mapping)[0] ?? "count";
      return builder;
    },
    orderBy(column, direction = "asc") {
      orderClauses.push({ column, direction });
      return builder;
    },
    first() {
      returnsFirst = true;
      return builder;
    },
    then(onFulfilled, onRejected) {
      return Promise.resolve().then(evaluate).then(onFulfilled, onRejected);
    },
  };

  return builder;
}

vi.mock("../database/connection", () => ({
  db: (table: string) => makeQueryBuilder(table),
  default: (table: string) => makeQueryBuilder(table),
}));

import { ReceiptsReportModel } from "../models/ReceiptsReportModel";

function makeWorkItem(
  overrides: Partial<WorkItemFixture> = {}
): WorkItemFixture {
  return {
    id: overrides.id ?? "work-1",
    organization_id: overrides.organization_id ?? 1,
    location_id: overrides.location_id ?? 10,
    content_type: overrides.content_type ?? "local_post",
    status: overrides.status ?? "published",
    published_at: overrides.published_at ?? START_AT,
    created_at: overrides.created_at ?? START_AT,
  };
}

function makeRanking(overrides: Partial<RankingFixture> = {}): RankingFixture {
  return {
    id: overrides.id ?? 1,
    organization_id: overrides.organization_id ?? 1,
    location_id: overrides.location_id === undefined ? 10 : overrides.location_id,
    status: overrides.status ?? "completed",
    search_status: overrides.search_status === undefined ? "ok" : overrides.search_status,
    search_position:
      overrides.search_position === undefined ? 4 : overrides.search_position,
    search_query: overrides.search_query ?? "dentist near me",
    search_results: overrides.search_results ?? [{ name: "Client", isClient: true }],
    search_checked_at:
      overrides.search_checked_at === undefined
        ? START_AT
        : overrides.search_checked_at,
    search_position_source:
      overrides.search_position_source === undefined
        ? "serpapi_maps"
        : overrides.search_position_source,
    observed_at: overrides.observed_at ?? START_AT,
  };
}

beforeEach(() => {
  fixtures = emptyFixtures();
  failingTables = new Set();
  vi.clearAllMocks();
});

describe("ReceiptsReportModel.listLocationsByOrganization", () => {
  it("returns only the requested tenant, including historical cancelled locations", async () => {
    fixtures.locations = [
      { id: 20, organization_id: 1, name: "West", status: "cancelled" },
      { id: 10, organization_id: 1, name: "Main", status: "active" },
      { id: 5, organization_id: 2, name: "Foreign", status: "active" },
    ];

    await expect(
      ReceiptsReportModel.listLocationsByOrganization(1)
    ).resolves.toEqual([
      { id: 10, name: "Main" },
      { id: 20, name: "West" },
    ]);
  });
});

describe("ReceiptsReportModel.countFormSubmissionsForPeriod", () => {
  it("applies the project tenant join and half-open submitted_at range", async () => {
    fixtures.projects = [
      { id: "project-a", organization_id: 1 },
      { id: "project-b", organization_id: 2 },
    ];
    fixtures.formSubmissions = [
      { id: "start", project_id: "project-a", submitted_at: START_AT },
      {
        id: "inside",
        project_id: "project-a",
        submitted_at: new Date("2026-07-31T23:59:59.999Z"),
      },
      { id: "end", project_id: "project-a", submitted_at: END_EXCLUSIVE_AT },
      { id: "foreign", project_id: "project-b", submitted_at: START_AT },
    ];

    await expect(
      ReceiptsReportModel.countFormSubmissionsForPeriod(
        1,
        START_AT,
        END_EXCLUSIVE_AT
      )
    ).resolves.toBe(2);
  });
});

describe("ReceiptsReportModel.countPublishedGbpWorkItemsByLocation", () => {
  it("counts only published attributable work in the tenant and period", async () => {
    fixtures.workItems = [
      makeWorkItem({ id: "post-1", location_id: 10 }),
      makeWorkItem({ id: "post-2", location_id: 10 }),
      makeWorkItem({ id: "reply-1", location_id: 10, content_type: "review_reply" }),
      makeWorkItem({ id: "reply-2", location_id: 20, content_type: "review_reply" }),
      makeWorkItem({ id: "draft", status: "draft" }),
      makeWorkItem({ id: "end", published_at: END_EXCLUSIVE_AT }),
      makeWorkItem({ id: "foreign", organization_id: 2 }),
      makeWorkItem({
        id: "created-only",
        created_at: START_AT,
        published_at: new Date("2026-08-02T00:00:00.000Z"),
      }),
    ];

    await expect(
      ReceiptsReportModel.countPublishedGbpWorkItemsByLocation(
        1,
        START_AT,
        END_EXCLUSIVE_AT
      )
    ).resolves.toEqual([
      { location_id: 10, content_type: "local_post", count: 2 },
      { location_id: 10, content_type: "review_reply", count: 1 },
      { location_id: 20, content_type: "review_reply", count: 1 },
    ]);
  });
});

describe("ReceiptsReportModel.listCompletedSearchPositionObservations", () => {
  it("uses completed ok observations, search_checked_at, tenant scope, and deterministic order", async () => {
    const resultPayload = [{ name: "Top Competitor", position: 1 }];
    fixtures.rankings = [
      makeRanking({ id: 2, search_position: 6, search_results: resultPayload }),
      makeRanking({ id: 1, search_position: 4 }),
      makeRanking({ id: 3, location_id: 20, search_position: 2 }),
      makeRanking({ id: 4, organization_id: 2 }),
      makeRanking({ id: 5, status: "failed" }),
      makeRanking({ id: 6, search_status: "api_error" }),
      makeRanking({ id: 7, search_position: null }),
      makeRanking({ id: 8, location_id: null }),
      makeRanking({
        id: 9,
        observed_at: START_AT,
        search_checked_at: END_EXCLUSIVE_AT,
      }),
    ];

    const rows = await ReceiptsReportModel.listCompletedSearchPositionObservations(
      1,
      START_AT,
      END_EXCLUSIVE_AT
    );

    expect(rows.map((row) => row.id)).toEqual([1, 2, 3]);
    expect(rows[1]).toMatchObject({
      location_id: 10,
      search_position: 6,
      search_results: resultPayload,
      search_checked_at: START_AT,
      search_position_source: "serpapi_maps",
    });
  });
});

describe("ReceiptsReportModel failure and empty-source behavior", () => {
  it("returns honest empty values when every source is empty", async () => {
    await expect(
      ReceiptsReportModel.listLocationsByOrganization(1)
    ).resolves.toEqual([]);
    await expect(
      ReceiptsReportModel.countFormSubmissionsForPeriod(
        1,
        START_AT,
        END_EXCLUSIVE_AT
      )
    ).resolves.toBe(0);
    await expect(
      ReceiptsReportModel.countPublishedGbpWorkItemsByLocation(
        1,
        START_AT,
        END_EXCLUSIVE_AT
      )
    ).resolves.toEqual([]);
    await expect(
      ReceiptsReportModel.listCompletedSearchPositionObservations(
        1,
        START_AT,
        END_EXCLUSIVE_AT
      )
    ).resolves.toEqual([]);
  });

  it("propagates query errors rather than converting them to zero (§3.2)", async () => {
    failingTables.add("locations");
    await expect(
      ReceiptsReportModel.listLocationsByOrganization(1)
    ).rejects.toThrow("synthetic locations failure");

    failingTables = new Set(["website_builder.form_submissions"]);
    await expect(
      ReceiptsReportModel.countFormSubmissionsForPeriod(
        1,
        START_AT,
        END_EXCLUSIVE_AT
      )
    ).rejects.toThrow("synthetic website_builder.form_submissions failure");

    failingTables = new Set(["gbp_work_items"]);
    await expect(
      ReceiptsReportModel.countPublishedGbpWorkItemsByLocation(
        1,
        START_AT,
        END_EXCLUSIVE_AT
      )
    ).rejects.toThrow("synthetic gbp_work_items failure");

    failingTables = new Set(["practice_rankings"]);
    await expect(
      ReceiptsReportModel.listCompletedSearchPositionObservations(
        1,
        START_AT,
        END_EXCLUSIVE_AT
      )
    ).rejects.toThrow("synthetic practice_rankings failure");
  });
});
