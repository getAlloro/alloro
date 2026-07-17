/**
 * Findability Sensor PostgreSQL boundary proof — real server, no model mocks.
 *
 * This runs the A5 migration in isolation against a disposable local database,
 * matching the accepted migration-history caveat in the plan. The database name
 * and host guard are mandatory: this test refuses shared dev or production.
 *
 * Run only this file:
 *   DB_HOST=127.0.0.1 DB_PORT=<port> DB_USER=<user> \
 *   DB_NAME=alloro_findability_sensor_test_<suffix> DB_PASSWORD= \
 *   npm run test:integration:findability-sensor
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../database/connection";
import {
  FindabilitySensorKeywordConfigModel,
  FindabilitySensorReadingModel,
} from "../models/FindabilitySensorModel";
import {
  down as dropFindabilitySensorTables,
  up as createFindabilitySensorTables,
} from "../database/migrations/20260715000000_create_findability_sensor_tables";

const SAFE_DATABASE_PREFIX = "alloro_findability_sensor_test_";
const SAFE_HOSTS = new Set(["127.0.0.1", "localhost"]);

function assertDisposableDatabase(): void {
  const host = process.env.DB_HOST ?? "";
  const database = process.env.DB_NAME ?? "";
  if (!SAFE_HOSTS.has(host) || !database.startsWith(SAFE_DATABASE_PREFIX)) {
    throw new Error(
      `Findability Sensor integration test refused unsafe target host="${host}" database="${database}".`,
    );
  }
}

function expectFiniteNumber(value: unknown): void {
  expect(typeof value).toBe("number");
  expect(Number.isFinite(value)).toBe(true);
}

beforeAll(async () => {
  assertDisposableDatabase();
  await dropFindabilitySensorTables(db);
  await createFindabilitySensorTables(db);
});

afterAll(async () => {
  try {
    await dropFindabilitySensorTables(db);
  } finally {
    await db.destroy();
  }
});

describe("Findability Sensor config NUMERIC boundary — real PostgreSQL", () => {
  it("normalizes config radius_miles on both upsert and scoped read", async () => {
    const saved = await FindabilitySensorKeywordConfigModel.upsertConfig({
      organization_id: 7,
      location_id: 42,
      keywords: [{ keyword: "dentist", source: "service_list" }],
      grid_size: 7,
      radius_miles: 2.75,
      enabled: false,
    });
    const raw = await db.raw(
      "SELECT radius_miles FROM findability_sensor_keyword_configs WHERE id = ?",
      [saved.id],
    );
    const readBack = await FindabilitySensorKeywordConfigModel.findForLocation(7, 42);

    expect(typeof raw.rows[0].radius_miles).toBe("string");
    expectFiniteNumber(saved.radius_miles);
    expectFiniteNumber(readBack?.radius_miles);
    expect(saved.radius_miles).toBe(2.75);
    expect(readBack?.radius_miles).toBe(2.75);
  });
});

describe("Findability Sensor reading NUMERIC boundary — real PostgreSQL", () => {
  it("normalizes every reading decimal on upsert and scoped read", async () => {
    const saved = await FindabilitySensorReadingModel.upsertReading({
      organization_id: 7,
      location_id: 42,
      keyword: "dentist",
      keyword_source: "service_list",
      grid_size: 7,
      radius_miles: 2.75,
      center_lat: 30.2672,
      center_lng: -97.7431,
      solv_percent: 75.25,
      arp: 4.5,
      atrp: 8.25,
      total_pins: 9,
      known_pins: 8,
      unknown_pins: 1,
      ranked_pins: 6,
      top_three_pins: 4,
      coverage: 0.89,
      per_pin: [],
      open_hours_known: true,
      observed_at: new Date("2026-07-17T00:00:00.000Z"),
      run_date: "2026-07-17",
    });
    const raw = await db.raw(
      `SELECT radius_miles, center_lat, center_lng, solv_percent, arp, atrp, coverage
       FROM findability_sensor_readings WHERE id = ?`,
      [saved.id],
    );
    const [readBack] = await FindabilitySensorReadingModel.latestForLocation(7, 42);
    const fieldNames = [
      "radius_miles",
      "center_lat",
      "center_lng",
      "solv_percent",
      "arp",
      "atrp",
      "coverage",
    ] as const;

    for (const field of fieldNames) {
      expect(typeof raw.rows[0][field]).toBe("string");
      expectFiniteNumber(saved[field]);
      expectFiniteNumber(readBack[field]);
    }
    expect(saved).toMatchObject({
      radius_miles: 2.75,
      center_lat: 30.2672,
      center_lng: -97.7431,
      solv_percent: 75.25,
      arp: 4.5,
      atrp: 8.25,
      coverage: 0.89,
    });
    expect(readBack).toMatchObject({
      radius_miles: 2.75,
      center_lat: 30.2672,
      center_lng: -97.7431,
      solv_percent: 75.25,
      arp: 4.5,
      atrp: 8.25,
      coverage: 0.89,
    });
  });
});
