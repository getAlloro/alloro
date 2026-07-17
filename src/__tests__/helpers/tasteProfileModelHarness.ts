import type { Knex } from "knex";
import { vi } from "vitest";
import type { ITasteProfile } from "../../models/website-builder/TasteProfileModel";
import type { TasteProfile, TasteProfileAudit } from "../../types/tasteProfile";

interface SortSpec {
  column: string;
  direction: string;
}

interface TestInsertBuilder {
  returning(): Promise<ITasteProfile[]>;
}

interface TestQueryBuilder extends PromiseLike<ITasteProfile[]> {
  where(conditions: Record<string, unknown>): TestQueryBuilder;
  whereNull(column: string): TestQueryBuilder;
  whereIn(column: string, values: unknown[]): TestQueryBuilder;
  orderBy(column: string, direction: string): TestQueryBuilder;
  forUpdate(): TestQueryBuilder;
  first(): Promise<ITasteProfile | undefined>;
  insert(data: Record<string, unknown>): TestInsertBuilder;
  update(data: Record<string, unknown>): Promise<number>;
  del(): Promise<number>;
}

interface TestTransaction {
  (): TestQueryBuilder;
  isTransaction: true;
  raw(sql: string, bindings?: readonly unknown[]): Promise<void>;
}

interface TestDatabase {
  (): TestQueryBuilder;
  transaction<T>(callback: (trx: TestTransaction) => Promise<T>): Promise<T>;
}

interface AdvisoryLockCall {
  sql: string;
  bindings: readonly unknown[];
}

interface TasteProfileHarnessState {
  rows: ITasteProfile[];
  lastWhereConditions: Array<Record<string, unknown>>;
  updateWheres: Array<Record<string, unknown>>;
  deleteWheres: Array<Record<string, unknown>>;
  advisoryLockCalls: AdvisoryLockCall[];
  transactionCallCount: number;
}

export const tasteProfileHarness: TasteProfileHarnessState = {
  rows: [],
  lastWhereConditions: [],
  updateWheres: [],
  deleteWheres: [],
  advisoryLockCalls: [],
  transactionCallCount: 0,
};

export function makeTasteProfile(): TasteProfile {
  return {
    business_name: "Cedar Park Dental",
    business_category: "Dentist",
    voice: { archetype: "The Caregiver", tone_descriptor: "warm, unhurried" },
    hero_quote: { value: "They explained every step.", source: "review:r-101" },
    suggested_headline: "Dentistry at your pace",
    unique_strength: null,
    praise_themes: [],
    credentials: [],
    practice_facts: [],
    customer_journey: { why_they_choose: [], what_makes_them_hesitate: [] },
  };
}

export function makeTasteProfileAudit(): TasteProfileAudit {
  return { kept: 1, dropped: [], rejected: [] };
}

export function makeTasteProfileRow(
  overrides: Partial<ITasteProfile>
): ITasteProfile {
  return {
    id: overrides.id ?? `tp-${Math.random().toString(36).slice(2)}`,
    organization_id: overrides.organization_id ?? 1,
    location_id: overrides.location_id ?? null,
    status: overrides.status ?? "draft",
    business_name: overrides.business_name ?? "Cedar Park Dental",
    business_category: overrides.business_category ?? "Dentist",
    profile: overrides.profile ?? makeTasteProfile(),
    source_summary: overrides.source_summary ?? makeTasteProfileAudit(),
    approved_by: overrides.approved_by ?? null,
    approved_at: overrides.approved_at ?? null,
    created_at: overrides.created_at ?? new Date("2026-07-01T00:00:00Z"),
    updated_at: overrides.updated_at ?? new Date("2026-07-01T00:00:00Z"),
  };
}

function rowValue(row: ITasteProfile, column: string): unknown {
  return (row as unknown as Record<string, unknown>)[column];
}

function sortValue(row: ITasteProfile, column: string): number {
  const value = rowValue(row, column);
  if (value instanceof Date) return value.getTime();
  if (value === null || value === undefined) return Number.NEGATIVE_INFINITY;
  return Number(value);
}

function makeQueryBuilder(): TestQueryBuilder {
  const filters: Array<(row: ITasteProfile) => boolean> = [];
  const ownWhere: Record<string, unknown> = {};
  let sortSpec: SortSpec | null = null;

  const apply = (): ITasteProfile[] => {
    const matched = tasteProfileHarness.rows.filter((row) =>
      filters.every((filter) => filter(row))
    );
    if (!sortSpec) return matched;
    const { column, direction } = sortSpec;
    return [...matched].sort((left, right) =>
      direction === "desc"
        ? sortValue(right, column) - sortValue(left, column)
        : sortValue(left, column) - sortValue(right, column)
    );
  };

  const builder: TestQueryBuilder = {
    where: vi.fn((conditions: Record<string, unknown>) => {
      tasteProfileHarness.lastWhereConditions.push(conditions);
      Object.assign(ownWhere, conditions);
      filters.push((row) =>
        Object.entries(conditions).every(
          ([column, value]) => rowValue(row, column) === value
        )
      );
      return builder;
    }),
    whereNull: vi.fn((column: string) => {
      filters.push((row) => rowValue(row, column) === null);
      return builder;
    }),
    whereIn: vi.fn((column: string, values: unknown[]) => {
      filters.push((row) => values.includes(rowValue(row, column)));
      return builder;
    }),
    orderBy: vi.fn((column: string, direction: string) => {
      sortSpec = { column, direction };
      return builder;
    }),
    forUpdate: vi.fn(() => builder),
    first: vi.fn(() => Promise.resolve(apply()[0])),
    insert: vi.fn((data: Record<string, unknown>) => ({
      returning: vi.fn(() => {
        const row = {
          id: `tp-generated-${tasteProfileHarness.rows.length + 1}`,
          ...data,
        } as unknown as ITasteProfile;
        tasteProfileHarness.rows.push(row);
        return Promise.resolve([row]);
      }),
    })),
    update: vi.fn((data: Record<string, unknown>) => {
      tasteProfileHarness.updateWheres.push({ ...ownWhere });
      const targets = apply();
      targets.forEach((row) => Object.assign(row, data));
      return Promise.resolve(targets.length);
    }),
    del: vi.fn(() => {
      tasteProfileHarness.deleteWheres.push({ ...ownWhere });
      const targets = apply();
      tasteProfileHarness.rows = tasteProfileHarness.rows.filter(
        (row) => !targets.includes(row)
      );
      return Promise.resolve(targets.length);
    }),
    then: (onFulfilled, onRejected) =>
      Promise.resolve(apply()).then(onFulfilled, onRejected),
  };

  return builder;
}

const transactionHandle = vi.fn(() =>
  makeQueryBuilder()
) as unknown as TestTransaction;
transactionHandle.isTransaction = true;
transactionHandle.raw = vi.fn(
  async (sql: string, bindings: readonly unknown[] = []): Promise<void> => {
    tasteProfileHarness.advisoryLockCalls.push({ sql, bindings });
  }
);

async function runTransaction<T>(
  callback: (trx: TestTransaction) => Promise<T>
): Promise<T> {
  tasteProfileHarness.transactionCallCount += 1;
  return callback(transactionHandle);
}

export const tasteProfileDatabaseMock = vi.fn(() =>
  makeQueryBuilder()
) as unknown as TestDatabase;
tasteProfileDatabaseMock.transaction = vi.fn(runTransaction) as unknown as
  TestDatabase["transaction"];

export const tasteProfileTransaction =
  transactionHandle as unknown as Knex.Transaction;

export const nonTransactionContext = Object.assign(
  vi.fn(() => makeQueryBuilder()),
  { isTransaction: false }
) as unknown as Knex.Transaction;

export function resetTasteProfileHarness(): void {
  tasteProfileHarness.rows = [];
  tasteProfileHarness.lastWhereConditions = [];
  tasteProfileHarness.updateWheres = [];
  tasteProfileHarness.deleteWheres = [];
  tasteProfileHarness.advisoryLockCalls = [];
  tasteProfileHarness.transactionCallCount = 0;
  vi.clearAllMocks();
}
