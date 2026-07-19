import knex, { type Knex } from "knex";
import {
  down as dropTasteProfiles,
  up as createTasteProfiles,
} from "../src/database/migrations/20260714000000_create_taste_profiles";
import {
  down as dropApprovalUniqueness,
  up as createApprovalUniqueness,
} from "../src/database/migrations/20260717000000_enforce_taste_profile_approval_uniqueness";
import type { TasteProfile, TasteProfileAudit } from "../src/types/tasteProfile";

const TEST_DATABASE_ENV = "TASTE_PROFILE_TEST_DATABASE_URL";
const TEST_DATABASE_PREFIX = "alloro_taste_profile_test";
const UNIQUE_VIOLATION = "23505";
const FORCED_FAILURE = "P0001";
const CONCURRENCY_WAIT_MS = 150;
const EXPECTED_INDEXES = [
  "taste_profiles_one_org_level_approved_unique",
  "taste_profiles_one_location_approved_unique",
];

type TasteProfileModelClass =
  typeof import("../src/models/website-builder/TasteProfileModel")["TasteProfileModel"];

interface PostgreSqlError {
  code?: string;
}

interface IndexRow {
  indexname: string;
}

interface VersionRow {
  setting: string;
}

interface StatusRow {
  id: string;
  status: string;
  approved_by: string | null;
}

interface VerificationEvidence {
  postgresVersion: string;
  migrationCycle: string;
  uniqueness: string[];
  rollback: string;
  concurrency: string[];
}

function assert(
  condition: unknown,
  message: string
): asserts condition {
  if (!condition) throw new Error(message);
}

function postgresErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  return (error as PostgreSqlError).code;
}

function configureModelDatabase(databaseUrl: URL): void {
  assert(
    ["127.0.0.1", "localhost", "::1"].includes(databaseUrl.hostname),
    `${TEST_DATABASE_ENV} must target localhost`
  );
  const databaseName = databaseUrl.pathname.replace(/^\//, "");
  assert(
    databaseName.startsWith(TEST_DATABASE_PREFIX),
    `${TEST_DATABASE_ENV} database must start with ${TEST_DATABASE_PREFIX}`
  );

  process.env.NODE_ENV = "development";
  process.env.DB_HOST = databaseUrl.hostname;
  process.env.DB_PORT = databaseUrl.port || "5432";
  process.env.DB_USER = decodeURIComponent(databaseUrl.username);
  process.env.DB_PASSWORD = decodeURIComponent(databaseUrl.password);
  process.env.DB_NAME = databaseName;
  process.env.DB_SSL = "false";
  process.env.VITEST = "true";
}

function profilePayload(): TasteProfile {
  return {
    business_name: "Synthetic Taste Profile Test",
    business_category: "Dentist",
    voice: { archetype: "Caregiver", tone_descriptor: "clear" },
    hero_quote: null,
    suggested_headline: "Synthetic test",
    unique_strength: null,
    praise_themes: [],
    credentials: [],
    practice_facts: [],
    customer_journey: {
      why_they_choose: [],
      what_makes_them_hesitate: [],
    },
  };
}

function auditPayload(): TasteProfileAudit {
  return { kept: 0, dropped: [], rejected: [] };
}

async function createDraft(
  database: Knex,
  model: TasteProfileModelClass,
  organizationId: number,
  locationId: number | null,
  businessName: string
): Promise<string> {
  const row = await model.create({
    organization_id: organizationId,
    location_id: locationId,
    business_name: businessName,
    business_category: "Dentist",
    profile: profilePayload(),
    source_summary: auditPayload(),
  }, database);
  return row.id;
}

async function approveInTransaction(
  database: Knex,
  model: TasteProfileModelClass,
  id: string,
  organizationId: number,
  approvedBy: string
): Promise<number> {
  return database.transaction((trx) =>
    model.markApproved(id, organizationId, approvedBy, trx)
  );
}

async function approvalIndexNames(database: Knex): Promise<string[]> {
  const rows = await database<IndexRow>("pg_indexes")
    .select("indexname")
    .where("schemaname", "public")
    .where("tablename", "taste_profiles")
    .whereIn("indexname", EXPECTED_INDEXES);
  return rows.map((row) => row.indexname).sort();
}

async function assertApprovalIndexes(database: Knex): Promise<void> {
  expectSameMembers(await approvalIndexNames(database), EXPECTED_INDEXES);
}

function expectSameMembers(actual: string[], expected: string[]): void {
  assert(
    JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort()),
    `Expected ${expected.join(", ")}; got ${actual.join(", ")}`
  );
}

async function expectUniqueViolation(
  operation: () => Promise<unknown>,
  label: string
): Promise<void> {
  let rejected = false;
  try {
    await operation();
  } catch (error) {
    rejected = true;
    assert(
      postgresErrorCode(error) === UNIQUE_VIOLATION,
      `${label} failed with ${postgresErrorCode(error) ?? "unknown"}, not 23505`
    );
  }
  assert(rejected, `${label} unexpectedly allowed a duplicate approved row`);
}

async function insertApproved(
  database: Knex,
  organizationId: number,
  locationId: number | null,
  approvedBy: string
): Promise<void> {
  await database("taste_profiles").insert({
    organization_id: organizationId,
    location_id: locationId,
    status: "approved",
    profile: JSON.stringify(profilePayload()),
    source_summary: JSON.stringify(auditPayload()),
    approved_by: approvedBy,
    approved_at: database.fn.now(),
  });
}

async function proveMigrationCycle(database: Knex): Promise<void> {
  await dropApprovalUniqueness(database);
  await dropTasteProfiles(database);

  await createTasteProfiles(database);
  await createApprovalUniqueness(database);
  await assertApprovalIndexes(database);

  await dropApprovalUniqueness(database);
  await dropTasteProfiles(database);
  assert(
    !(await database.schema.hasTable("taste_profiles")),
    "Migration down left taste_profiles behind"
  );

  await createTasteProfiles(database);
  await createApprovalUniqueness(database);
  await createApprovalUniqueness(database);
  await assertApprovalIndexes(database);
}

async function proveUniqueness(database: Knex): Promise<string[]> {
  await database("taste_profiles").del();

  await insertApproved(database, 501, null, "org-owner-a@test.invalid");
  await expectUniqueViolation(
    () => insertApproved(database, 501, null, "org-owner-b@test.invalid"),
    "organization-level NULL scope"
  );
  await insertApproved(database, 502, null, "other-org@test.invalid");

  await insertApproved(database, 503, 77, "location-owner-a@test.invalid");
  await expectUniqueViolation(
    () => insertApproved(database, 503, 77, "location-owner-b@test.invalid"),
    "non-null location scope"
  );
  await insertApproved(database, 503, 78, "other-location@test.invalid");

  return [
    "duplicate approved rows rejected for location_id IS NULL (23505)",
    "duplicate approved rows rejected for non-null location_id (23505)",
    "different organizations and locations remain independent",
  ];
}

async function installRollbackTrigger(database: Knex): Promise<void> {
  await database.raw(`
    CREATE OR REPLACE FUNCTION reject_taste_profile_test_approval()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      IF NEW.business_name = 'ROLLBACK_SENTINEL'
         AND NEW.status = 'approved' THEN
        RAISE EXCEPTION 'forced taste profile approval failure';
      END IF;
      RETURN NEW;
    END;
    $$
  `);
  await database.raw(`
    CREATE TRIGGER reject_taste_profile_test_approval
    BEFORE UPDATE ON taste_profiles
    FOR EACH ROW
    EXECUTE FUNCTION reject_taste_profile_test_approval()
  `);
}

async function removeRollbackTrigger(database: Knex): Promise<void> {
  await database.raw(
    "DROP TRIGGER IF EXISTS reject_taste_profile_test_approval ON taste_profiles"
  );
  await database.raw(
    "DROP FUNCTION IF EXISTS reject_taste_profile_test_approval()"
  );
}

async function proveRollback(
  database: Knex,
  model: TasteProfileModelClass
): Promise<string> {
  const organizationId = 601;
  await database("taste_profiles").del();

  const incumbentId = await createDraft(
    database,
    model,
    organizationId,
    null,
    "Incumbent"
  );
  assert(
    (await approveInTransaction(
      database,
      model,
      incumbentId,
      organizationId,
      "original-owner@test.invalid"
    )) === 1,
    "Could not approve rollback incumbent"
  );
  const failingDraftId = await createDraft(
    database,
    model,
    organizationId,
    null,
    "ROLLBACK_SENTINEL"
  );

  await installRollbackTrigger(database);
  let failed = false;
  try {
    await approveInTransaction(
      database,
      model,
      failingDraftId,
      organizationId,
      "replacement-owner@test.invalid"
    );
  } catch (error) {
    failed = true;
    assert(
      postgresErrorCode(error) === FORCED_FAILURE,
      `Rollback proof failed with ${postgresErrorCode(error) ?? "unknown"}`
    );
  } finally {
    await removeRollbackTrigger(database);
  }
  assert(failed, "Forced failure did not reject markApproved");

  const rows = await database<StatusRow>("taste_profiles")
    .select("id", "status", "approved_by")
    .where("organization_id", organizationId);
  const incumbent = rows.find((row) => row.id === incumbentId);
  const draft = rows.find((row) => row.id === failingDraftId);
  assert(
    incumbent?.status === "approved" &&
      incumbent.approved_by === "original-owner@test.invalid",
    "Rollback did not restore the incumbent approval"
  );
  assert(
    draft?.status === "draft" && draft.approved_by === null,
    "Rollback did not restore the replacement draft"
  );

  return "forced failure after supersession rolled back both statements";
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function rollbackIfOpen(transaction: Knex.Transaction): Promise<void> {
  if (!transaction.isCompleted()) {
    await transaction.rollback();
    await transaction.executionPromise;
  }
}

async function proveConcurrentScope(
  database: Knex,
  model: TasteProfileModelClass,
  organizationId: number,
  locationId: number | null
): Promise<string> {
  await database("taste_profiles")
    .where({ organization_id: organizationId })
    .del();
  const firstDraftId = await createDraft(
    database,
    model,
    organizationId,
    locationId,
    "Concurrent A"
  );
  const secondDraftId = await createDraft(
    database,
    model,
    organizationId,
    locationId,
    "Concurrent B"
  );
  const firstTransaction = await database.transaction();
  const secondTransaction = await database.transaction();

  try {
    const firstResult = await model.markApproved(
      firstDraftId,
      organizationId,
      "concurrent-a@test.invalid",
      firstTransaction
    );
    let secondSettled = false;
    const secondPromise = model.markApproved(
      secondDraftId,
      organizationId,
      "concurrent-b@test.invalid",
      secondTransaction
    );
    void secondPromise.then(
      () => {
        secondSettled = true;
      },
      () => {
        secondSettled = true;
      }
    );

    await delay(CONCURRENCY_WAIT_MS);
    assert(
      !secondSettled,
      "Second approval did not block on the org+location advisory lock"
    );

    await firstTransaction.commit();
    await firstTransaction.executionPromise;
    const secondResult = await secondPromise;
    await secondTransaction.commit();
    await secondTransaction.executionPromise;
    assert(firstResult === 1 && secondResult === 1, "Concurrent approvals failed");
  } finally {
    await rollbackIfOpen(firstTransaction);
    await rollbackIfOpen(secondTransaction);
  }

  const rows = await database<StatusRow>("taste_profiles")
    .select("id", "status", "approved_by")
    .where("organization_id", organizationId);
  assert(
    rows.filter((row) => row.status === "approved").length === 1,
    "Concurrent approvals left more than one current row"
  );
  assert(
    rows.filter((row) => row.status === "superseded").length === 1,
    "Concurrent approvals did not preserve the superseded stake"
  );
  expectSameMembers(
    rows
      .map((row) => row.approved_by)
      .filter((value): value is string => value !== null),
    ["concurrent-a@test.invalid", "concurrent-b@test.invalid"]
  );

  return locationId === null
    ? "NULL location scope serialized; one approved + one superseded"
    : `location ${locationId} serialized; one approved + one superseded`;
}

async function main(): Promise<void> {
  const rawDatabaseUrl = process.env[TEST_DATABASE_ENV];
  assert(rawDatabaseUrl, `${TEST_DATABASE_ENV} is required`);
  const databaseUrl = new URL(rawDatabaseUrl);
  configureModelDatabase(databaseUrl);

  const database = knex({
    client: "pg",
    connection: rawDatabaseUrl,
    pool: { min: 0, max: 8 },
  });
  const { TasteProfileModel } = await import(
    "../src/models/website-builder/TasteProfileModel"
  );
  const { db: modelDatabase } = await import("../src/database/connection");

  try {
    const version = await database<VersionRow>("pg_settings")
      .select("setting")
      .where("name", "server_version")
      .first();
    assert(version?.setting.startsWith("16."), "PostgreSQL 16 is required");

    await proveMigrationCycle(database);
    const evidence: VerificationEvidence = {
      postgresVersion: version.setting,
      migrationCycle: "up -> down -> re-up passed; both indexes restored",
      uniqueness: await proveUniqueness(database),
      rollback: await proveRollback(database, TasteProfileModel),
      concurrency: [
        await proveConcurrentScope(database, TasteProfileModel, 701, null),
        await proveConcurrentScope(database, TasteProfileModel, 702, 88),
      ],
    };
    process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
  } finally {
    await modelDatabase.destroy();
    await database.destroy();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
