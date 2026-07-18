/**
 * Model SQL-shape tests — FormSubmissionModel month-bucket alignment.
 *
 * The honesty invariant `sum(bySource.verified) === headline.verified` only
 * holds if the by-source read (`getVerifiedStatsBySource`) buckets rows by the
 * EXACT same expression as the headline (`getMonthlyStatsByProject`).
 * `date_trunc('month', submitted_at)` on a `timestamptz` is evaluated in the DB
 * SESSION timezone, so a UTC instant window would put a boundary row in a
 * different bucket than the headline under a non-UTC session TZ.
 *
 * These tests compile the REAL model queries with a pg-dialect Knex (no live DB —
 * execution is intercepted and the SQL captured, §20.4 synthetic) and assert
 * both queries share the identical month-bucket expression and lower bound, so
 * the two are TZ-consistent BY CONSTRUCTION for any DB session timezone.
 */

import { describe, it, expect } from "vitest";
import knex, { type Knex } from "knex";
import {
  FormSubmissionModel,
  MONTH_BUCKET_SQL,
  MONTH_KEY_SQL,
} from "../models/website-builder/FormSubmissionModel";

const pg = knex({ client: "pg" });

/**
 * A callable that stands in for a Knex handle (`(trx || db)(table)` and
 * `this.table(trx)`). It returns a real pg query builder whose terminal
 * `.then` is shadowed to capture the compiled SQL instead of connecting.
 */
function capturingTrx(): {
  trx: Knex;
  sqls: string[];
  bindings: readonly unknown[][];
} {
  const sqls: string[] = [];
  const bindings: unknown[][] = [];
  const fn = ((table: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const qb: any = pg(table);
    qb.then = (
      onFulfilled: (value: unknown[]) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => {
      const compiled = qb.toSQL();
      sqls.push(compiled.sql);
      bindings.push(compiled.bindings as unknown[]);
      return Promise.resolve([]).then(onFulfilled, onRejected);
    };
    return qb;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;
  return { trx: fn as Knex, sqls, bindings };
}

const PROJECT = "proj-1";
const START_ISO = "2026-06-01T00:00:00.000Z";
const MONTH_KEY = "2026-06";

describe("FormSubmissionModel — month-bucket alignment", () => {
  it("both queries bucket months on the identical date_trunc expression", async () => {
    const headline = capturingTrx();
    await FormSubmissionModel.getMonthlyStatsByProject(
      PROJECT,
      START_ISO,
      headline.trx,
    );
    const bySource = capturingTrx();
    await FormSubmissionModel.getVerifiedStatsBySource(
      PROJECT,
      START_ISO,
      MONTH_KEY,
      bySource.trx,
    );

    const headlineSql = headline.sqls.join("");
    const bySourceSql = bySource.sqls.join("");

    // Same session-TZ month-bucket expression in BOTH queries — this is what
    // guarantees a boundary row lands in the same bucket regardless of TZ.
    expect(MONTH_BUCKET_SQL).toBe("date_trunc('month', submitted_at)");
    expect(headlineSql).toContain(MONTH_BUCKET_SQL);
    expect(bySourceSql).toContain(MONTH_BUCKET_SQL);

    // The by-source read matches the month by the SAME YYYY-MM label expression
    // the headline groups/labels by — NOT a UTC instant `< end` window.
    expect(bySourceSql).toContain(`${MONTH_KEY_SQL} = ?`);
    expect(bySourceSql).not.toContain('"submitted_at" <');
  });

  it("shares the same submitted_at lower bound as the headline", async () => {
    const headline = capturingTrx();
    await FormSubmissionModel.getMonthlyStatsByProject(
      PROJECT,
      START_ISO,
      headline.trx,
    );
    const bySource = capturingTrx();
    await FormSubmissionModel.getVerifiedStatsBySource(
      PROJECT,
      START_ISO,
      MONTH_KEY,
      bySource.trx,
    );

    // Both apply `submitted_at >= START_ISO`; the by-source also binds the month
    // key. Same lower bound + same bucket expr ⇒ identical per-month row set.
    expect(headline.bindings.flat()).toContain(START_ISO);
    expect(bySource.bindings.flat()).toContain(START_ISO);
    expect(bySource.bindings.flat()).toContain(MONTH_KEY);
  });

  it("keeps the verified predicate (non-flagged, non-newsletter) in by-source", async () => {
    const bySource = capturingTrx();
    await FormSubmissionModel.getVerifiedStatsBySource(
      PROJECT,
      START_ISO,
      MONTH_KEY,
      bySource.trx,
    );
    const sql = bySource.sqls.join("");
    expect(sql).toContain('"is_flagged"');
    expect(sql).toContain('"form_name"');
    expect(sql).toContain('"project_id"'); // tenant scope (§11.7)
    expect(bySource.bindings.flat()).toContain("Newsletter Signup");
  });
});
